import {
  ANALYTICS_PARAM_VALUE_PATTERN,
  type AcquisitionRequest,
  type AcquisitionResponse,
  type InstallAttributionMessage,
} from "@focusmakers/types";

import { postAcquisition } from "./acquisitionApi";
import { setInstallAttributionUserProperties } from "./amplitude";
import { ApiError } from "./api";
import { postToNative } from "./bridge";
import { reportHandled } from "./sentry";

/**
 * 설치 유입 경로 기록
 *
 * 앱이 설치 직후 읽은 플레이 설치 정보와 메타·구글 지연 딥링크를 받아 서버에 저장하고, 서버가 정한 유입 경로를 Amplitude 사용자 속성으로 남긴다.
 * 광고별로 남는 사용자를 비교하려면 사람마다 처음 들어온 경로가 서버와 Amplitude 양쪽에 있어야 한다.
 * 메타 암호문은 서버만 풀 수 있어서 웹은 원문을 그대로 보낸다.
 */

/** 서버로 보낼 설치 정보 원문을 보관하는 키다. */
export const INSTALL_ATTRIBUTION_PENDING_KEY = "focusmakers:install-attribution";

export type PendingInstallAttribution = {
  platform: "ios" | "android";
  installReferrer: string | null;
  deepLinkAd: string | null;
  googleDeepLinkAd: string | null;
  capturedAtMs: number;
};

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;

export function toAcquisitionRequest(pending: PendingInstallAttribution): AcquisitionRequest {
  return {
    platform: pending.platform === "ios" ? "IOS" : "ANDROID",
    installReferrer: pending.installReferrer,
    deepLinkAd: pending.deepLinkAd,
    googleDeepLinkAd: pending.googleDeepLinkAd,
    capturedAt: new Date(pending.capturedAtMs).toISOString(),
  };
}

/**
 * 서버 응답을 Amplitude 사용자 속성으로 바꾼다
 *
 * 초대코드는 사용자를 가리킬 수 있어 싣지 않는다.
 * 모르는 유입 경로가 와도 버리지 않고 소문자로 그대로 남긴다.
 */
export function acquisitionUserProperties(response: AcquisitionResponse): Record<string, string> {
  const properties: Record<string, string> = { install_source: response.source.toLowerCase() };
  const label = response.metaAd?.label ?? response.googleAd?.label;
  if (label) properties.install_ad = label;
  const meta = response.metaAd;
  if (meta?.campaignId) properties.install_meta_campaign_id = meta.campaignId;
  if (meta?.adsetId) properties.install_meta_adset_id = meta.adsetId;
  if (meta?.adId) properties.install_meta_ad_id = meta.adId;
  return properties;
}

/** 서버 응답에는 UTM이 없어서 원문에서 토큰 형식 값만 꺼낸다. */
export function installUtmProperties(installReferrer: string | null): Record<string, string> {
  const params = new URLSearchParams(installReferrer ?? "");
  const properties: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value !== null && ANALYTICS_PARAM_VALUE_PATTERN.test(value)) {
      properties[`install_${key}`] = value;
    }
  }
  return properties;
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

/** 보관한 원문을 읽는다. 구글 칸이 생기기 전에 보관한 값은 그 칸을 null로 본다. */
function parsePending(raw: string): PendingInstallAttribution | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const googleDeepLinkAd = record.googleDeepLinkAd === undefined ? null : record.googleDeepLinkAd;
  if (
    (record.platform !== "ios" && record.platform !== "android") ||
    !isStringOrNull(record.installReferrer) ||
    !isStringOrNull(record.deepLinkAd) ||
    !isStringOrNull(googleDeepLinkAd) ||
    typeof record.capturedAtMs !== "number"
  ) {
    return null;
  }
  return {
    platform: record.platform,
    installReferrer: record.installReferrer,
    deepLinkAd: record.deepLinkAd,
    googleDeepLinkAd,
    capturedAtMs: record.capturedAtMs,
  };
}

function removePending(): void {
  try {
    localStorage.removeItem(INSTALL_ATTRIBUTION_PENDING_KEY);
  } catch {
    // 지우지 못하면 다음 실행에서 다시 보내지만 서버가 처음 값을 돌려줘서 결과가 같다.
  }
}

async function sendPending(): Promise<void> {
  let raw: string | null;
  try {
    raw = localStorage.getItem(INSTALL_ATTRIBUTION_PENDING_KEY);
  } catch {
    return;
  }
  if (raw === null) return;
  const pending = parsePending(raw);
  if (pending === null) {
    removePending();
    return;
  }
  let response: AcquisitionResponse;
  try {
    response = await postAcquisition(toAcquisitionRequest(pending));
  } catch (error) {
    // 400은 다시 보내도 같은 결과라 원문을 지운다. 그 밖의 실패는 다음 실행에서 다시 보낸다.
    if (error instanceof ApiError && error.status === 400) {
      // 이 사용자의 유입 기록을 잃는 것이라 알 수 있게 Sentry에 남긴다.
      reportHandled(error, "install-attribution");
      removePending();
    } else {
      console.warn("[install-attribution] acquisition request failed", error);
    }
    return;
  }
  // 서버에는 이미 저장됐으니 원문을 먼저 지운다. 남겨 두면 응답 모양이 어긋날 때 열 때마다 같은 실패를 되풀이한다.
  removePending();
  try {
    setInstallAttributionUserProperties({
      ...installUtmProperties(pending.installReferrer),
      ...acquisitionUserProperties(response),
    });
  } catch (error) {
    reportHandled(error, "install-attribution");
  }
}

let inFlight: Promise<void> | null = null;

/**
 * 보관한 원문을 서버로 보낸다
 *
 * 앱은 웹이 답할 때까지 같은 값을 여러 번 넘기므로, 보내는 중이면 새로 보내지 않고 그 전송을 기다린다.
 * 로그인을 따로 기다리지 않는 것은 앱이 게스트 등록을 마친 뒤 웹뷰를 열고, `apiFetch`가 앱의 첫 토큰을 기다렸다가 보내기 때문이다.
 */
export function flushInstallAttribution(): Promise<void> {
  inFlight ??= sendPending().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * 앱이 넘긴 설치 유입 정보 처리
 *
 * 원문을 보관한 뒤에만 앱에 받았다고 답한다.
 * 보관에 실패했는데 답하면 앱이 보관을 지워 서버로 보낼 원문이 사라진다.
 */
export function handleInstallAttribution(message: InstallAttributionMessage): void {
  const pending: PendingInstallAttribution = {
    platform: message.platform,
    installReferrer: message.installReferrer,
    deepLinkAd: message.deepLinkAd,
    googleDeepLinkAd: message.googleDeepLinkAd,
    capturedAtMs: message.capturedAtMs,
  };
  try {
    localStorage.setItem(INSTALL_ATTRIBUTION_PENDING_KEY, JSON.stringify(pending));
  } catch {
    return;
  }
  postToNative({ type: "install-attribution-received", atMs: Date.now() });
  void flushInstallAttribution();
}
