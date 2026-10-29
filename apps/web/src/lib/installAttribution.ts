import { ANALYTICS_PARAM_VALUE_PATTERN, type InstallAttributionMessage } from "@focusmakers/types";

import { setInstallAttributionUserProperties } from "./amplitude";
import { postToNative } from "./bridge";

/**
 * 설치 유입 경로 기록
 *
 * 앱이 설치 직후 읽은 플레이 설치 정보와 메타 지연 딥링크를 받아 Amplitude 사용자 속성으로 남긴다.
 * 광고별로 남는 사용자를 비교하려면 사람마다 처음 들어온 경로가 필요하다.
 * 메타 암호문에 든 캠페인과 광고 ID는 서버만 풀 수 있어서 여기서는 원문을 기기에 보관만 한다.
 * 서버 API가 생기면 보관한 원문을 보내고 지우는 일을 이 파일에 더한다.
 */

export type InstallSource = "meta_ad" | "invite" | "organic" | "other_link" | "unknown";

export interface InstallAttributionProperties {
  install_source: InstallSource;
  /** 메타 지연 딥링크의 광고 번호(`ios_v1` 등)다. */
  install_ad?: string;
  install_utm_source?: string;
  install_utm_medium?: string;
  install_utm_campaign?: string;
}

/** 서버로 보낼 설치 정보 원문을 보관하는 키다. */
export const INSTALL_ATTRIBUTION_PENDING_KEY = "focusmakers:install-attribution";

/** 메타 광고로 설치하면 플레이 설치 정보의 출처가 이 둘 중 하나다. */
const META_REFERRER_SOURCES = new Set(["apps.facebook.com", "apps.instagram.com"]);
/** 초대 링크가 플레이 설치 정보에 싣는 초대코드 형식이다(`installReferrerInvite.ts`와 같다). */
const INVITE_CODE_PATTERN = /^\d{4}$/;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;

/**
 * 설치 정보로 유입 경로를 정한다
 *
 * 광고마다 넣은 딥링크 번호가 가장 구체적이라 먼저 본다.
 * 초대코드와 UTM 값은 사용자를 가리킬 수 있는 문자열이라, 코드는 싣지 않고 UTM은 토큰 형식일 때만 싣는다.
 */
export function installAttributionProperties(
  message: InstallAttributionMessage,
): InstallAttributionProperties {
  if (message.deepLinkAd !== null) {
    return { install_source: "meta_ad", install_ad: message.deepLinkAd };
  }
  const params = new URLSearchParams(message.installReferrer ?? "");
  const source = params.get("utm_source");
  if (source !== null && META_REFERRER_SOURCES.has(source)) {
    return { install_source: "meta_ad" };
  }
  if (INVITE_CODE_PATTERN.test(params.get("code") ?? "")) {
    return { install_source: "invite" };
  }
  if (source === "google-play" && params.get("utm_medium") === "organic") {
    return { install_source: "organic" };
  }
  const properties: InstallAttributionProperties = { install_source: "other_link" };
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value !== null && ANALYTICS_PARAM_VALUE_PATTERN.test(value)) {
      properties[`install_${key}`] = value;
    }
  }
  // 출처 없이 캠페인 값만 실은 링크도 우리가 만든 링크라 그 밖의 링크로 센다.
  const hasUtm = Object.keys(properties).length > 1;
  return source !== null || hasUtm ? properties : { install_source: "unknown" };
}

/**
 * 앱이 넘긴 설치 유입 정보 처리
 *
 * 사용자 속성은 처음 값만 남도록 보내므로 앱이 같은 값을 여러 번 보내도 결과가 같다.
 * 원문을 보관한 뒤에만 앱에 받았다고 답한다.
 * 보관에 실패했는데 답하면 앱이 보관을 지워 서버로 보낼 원문이 사라진다.
 */
export function handleInstallAttribution(message: InstallAttributionMessage): void {
  setInstallAttributionUserProperties(installAttributionProperties(message));
  const raw = {
    platform: message.platform,
    installReferrer: message.installReferrer,
    deepLinkAd: message.deepLinkAd,
    capturedAtMs: message.capturedAtMs,
  };
  try {
    localStorage.setItem(INSTALL_ATTRIBUTION_PENDING_KEY, JSON.stringify(raw));
  } catch {
    return;
  }
  postToNative({ type: "install-attribution-received", atMs: Date.now() });
}
