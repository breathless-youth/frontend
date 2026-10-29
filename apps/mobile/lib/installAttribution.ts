import * as Application from "expo-application";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import {
  INSTALL_AD_LABEL_PATTERN,
  INSTALL_REFERRER_MAX_LENGTH,
  type InstallAttributionMessage,
} from "@focusmakers/types";

import { fetchMetaDeferredAppLink } from "./metaAds";

/**
 * 설치 유입 정보 통로
 *
 * 어느 광고나 링크로 설치했는지는 플레이 설치 정보와 메타 지연 딥링크로만 알 수 있고 둘 다 네이티브만 읽는다.
 * 분석 SDK는 웹에 있어서 설치당 한 번 읽어 기기에 보관하고, 준비된 웹뷰에 브리지 `install-attribution`으로 넘긴다.
 * 웹이 `install-attribution-received`로 답할 때까지 보관을 지우지 않는다.
 * 그래서 이 메시지를 모르는 구버전 웹을 만나도 웹이 배포된 뒤 다음 준비 신호에서 다시 넘어간다.
 * 메타 지연 딥링크는 설치 뒤 처음 물을 때만 돌려받을 수 있어서 한 번 읽은 값은 다시 읽지 않는다.
 * 전달 대상은 `lib/nativeAnalytics.ts`처럼 마지막에 붙은 sink 하나다.
 */

/** 브리지 `install-attribution`에서 `type`과 전송 시각을 뺀 모양이다. */
export type InstallAttribution = Omit<InstallAttributionMessage, "type" | "atMs">;

export type InstallAttributionSink = (payload: InstallAttribution) => void;

/** 보관 키 하나가 수집 전, 전달 대기, 전달 완료 세 상태를 가른다. */
const STORAGE_KEY = "installAttributionV1";
const ACKED = "acked";

let pending: InstallAttribution | null = null;
const sinks: InstallAttributionSink[] = [];

function activeSink(): InstallAttributionSink | null {
  return sinks[sinks.length - 1] ?? null;
}

/**
 * 지연 딥링크 주소에서 광고 번호(`fm_ad`)를 꺼낸다
 *
 * 메타는 주소 뒤에 `al_applink_data` 같은 파라미터를 덧붙인다.
 * RN의 URLSearchParams는 그중 하나라도 인코딩이 깨지면 URIError를 throw해서 `fm_ad` 값만 직접 푼다.
 * 형식 밖 값은 분석으로 내보내지 않으려고 버린다.
 */
export function deepLinkAdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const withoutFragment = url.split("#")[0] ?? "";
  const queryStart = withoutFragment.indexOf("?");
  if (queryStart === -1) return null;
  for (const pair of withoutFragment.slice(queryStart + 1).split("&")) {
    const [key, value = ""] = pair.split("=");
    if (key !== "fm_ad") continue;
    try {
      const label = decodeURIComponent(value);
      return INSTALL_AD_LABEL_PATTERN.test(label) ? label : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** 설치 정보를 읽은 결과다. 조회가 실패했는지를 가려야 다음 실행에서 다시 읽을지 정할 수 있다. */
type ReferrerRead = { failed: false; referrer: string | null } | { failed: true };

async function readInstallReferrer(): Promise<ReferrerRead> {
  if (Platform.OS !== "android") return { failed: false, referrer: null };
  try {
    const referrer = await Application.getInstallReferrerAsync();
    // 잘린 메타 암호문은 서버가 풀 수 없어서 길이를 넘으면 통째로 뺀다.
    const kept = referrer && referrer.length <= INSTALL_REFERRER_MAX_LENGTH ? referrer : null;
    return { failed: false, referrer: kept };
  } catch (error) {
    console.warn("[install-attribution] 설치 정보 조회 실패", error);
    return { failed: true };
  }
}

/**
 * 보관하는 모양
 *
 * 플레이 서비스가 잠깐 끊겨 설치 정보 조회가 실패하면 그 횟수를 남기고 다음 실행에서 설치 정보만 다시 읽는다.
 * 지연 딥링크는 처음 물을 때만 돌아오므로 다시 묻지 않는다.
 */
type Stored = InstallAttribution & { referrerFailures?: number };

/** 설치 정보 조회를 다시 시도하는 실행 횟수. 넘으면 원문 없이 넘긴다. 기기에 플레이 스토어가 없으면 영영 실패하기 때문이다. */
const MAX_REFERRER_ATTEMPTS = 3;

function applyReferrer(base: Stored, read: ReferrerRead): Stored {
  if (read.failed) {
    return { ...base, installReferrer: null, referrerFailures: (base.referrerFailures ?? 0) + 1 };
  }
  const next: Stored = { ...base, installReferrer: read.referrer };
  delete next.referrerFailures;
  return next;
}

async function collect(): Promise<Stored> {
  const [read, deepLink] = await Promise.all([readInstallReferrer(), fetchMetaDeferredAppLink()]);
  const base: Stored = {
    platform: Platform.OS === "ios" ? "ios" : "android",
    installReferrer: null,
    deepLinkAd: deepLinkAdFromUrl(deepLink),
    capturedAtMs: Date.now(),
  };
  return applyReferrer(base, read);
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

/** 보관한 값을 읽는다. 모양이 이상하면 수집 전으로 본다. 깨진 값을 웹에 계속 보내지 않기 위해서다. */
function parseStored(raw: string): Stored | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    (record.platform !== "ios" && record.platform !== "android") ||
    !isStringOrNull(record.installReferrer) ||
    !isStringOrNull(record.deepLinkAd) ||
    typeof record.capturedAtMs !== "number" ||
    (record.referrerFailures !== undefined && typeof record.referrerFailures !== "number")
  ) {
    return null;
  }
  return {
    platform: record.platform,
    installReferrer: record.installReferrer,
    deepLinkAd: record.deepLinkAd,
    capturedAtMs: record.capturedAtMs,
    ...(record.referrerFailures !== undefined ? { referrerFailures: record.referrerFailures } : {}),
  };
}

/**
 * 설치 유입 정보를 읽어 보관하고 붙어 있는 sink에 넘긴다
 *
 * 메타 지연 딥링크를 묻기 때문에 iOS 추적 동의 응답 뒤에 끝난다(`fetchMetaDeferredAppLink`).
 * 이미 보관한 값이 있으면 다시 읽지 않고, 웹이 받았다고 답했으면 아무것도 하지 않는다.
 * 설치 정보 조회만 실패했던 값은 설치 정보만 다시 읽는다.
 * 보관소를 읽지 못하면 이번 실행은 건너뛴다. 읽은 적 없는 사용자로 착각해 지연 딥링크를 다시 물으면 첫 값이 사라질 수 있다.
 */
export async function startInstallAttribution(): Promise<void> {
  let stored: string | null;
  try {
    stored = await SecureStore.getItemAsync(STORAGE_KEY);
  } catch (error) {
    console.warn("[install-attribution] 보관소 읽기 실패", error);
    return;
  }
  if (stored === ACKED) return;

  let saved = stored === null ? null : parseStored(stored);
  if (saved === null || saved.referrerFailures !== undefined) {
    saved = saved === null ? await collect() : applyReferrer(saved, await readInstallReferrer());
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(saved));
    } catch (error) {
      // 보관에 실패해도 이번 실행에서 웹이 받으면 기록은 남는다.
      console.warn("[install-attribution] 보관 실패", error);
    }
  }
  const { referrerFailures, ...payload } = saved;
  // 설치 정보를 아직 못 읽었으면 다음 실행에서 다시 읽고 넘긴다. 지금 넘기면 웹이 받았다고 답해 다시 읽을 기회가 사라진다.
  if (referrerFailures !== undefined && referrerFailures < MAX_REFERRER_ATTEMPTS) return;
  pending = payload;
  activeSink()?.(payload);
}

/**
 * sink를 붙인다
 *
 * 붙는 순간 넘길 값이 있으면 바로 넘긴다.
 * 웹이 답하기 전까지는 붙을 때마다 다시 넘기므로 웹은 같은 값을 여러 번 받아도 결과가 같아야 한다.
 */
export function attachInstallAttributionSink(sink: InstallAttributionSink): () => void {
  sinks.push(sink);
  if (pending !== null) sink(pending);
  return () => {
    const index = sinks.lastIndexOf(sink);
    if (index !== -1) sinks.splice(index, 1);
  };
}

/** 웹이 받았다고 답했다. 보관을 끝내 다음 실행부터는 읽지도 넘기지도 않는다. */
export async function acknowledgeInstallAttribution(): Promise<void> {
  pending = null;
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, ACKED);
  } catch (error) {
    // 기록하지 못하면 다음 실행에서 한 번 더 넘어가지만, 웹의 사용자 속성은 setOnce라 처음 값이 그대로 남는다.
    console.warn("[install-attribution] 전달 완료 기록 실패", error);
  }
}

/** 테스트 전용: 보관 값과 sink를 비운다. 프로덕션 코드에서는 호출하지 않는다. */
export function __resetInstallAttributionForTests(): void {
  pending = null;
  sinks.length = 0;
}
