import Constants from "expo-constants";
import type * as AirbridgeSdk from "airbridge-react-native-sdk";

import type { AnalyticsEventParamValue, MetaAppEventParamValue } from "@focusmakers/types";

/**
 * Airbridge(MMP) 인앱 이벤트 통로.
 *
 * 설치·앱 실행은 SDK가 네이티브에서 스스로 잡고(초기화는 `airbridge-expo-sdk` config plugin), ATT 응답은
 * `initMetaAds`가 띄운 프롬프트를 SDK가 기다렸다 읽는다(`airbridge.json`의 대기 상한). 이 모듈은 이벤트만 나른다.
 *
 * - Amplitude 카탈로그 전체: 브리지 `analytics-event`(Firebase로 가는 것과 같은 사본, 값은 이미 토큰만) → 커스텀 이벤트.
 * - 광고 전환: Meta 표준 전환 중 Airbridge 표준 이벤트가 있는 것만 → 표준 이벤트. 나머지 Meta 전환
 *   (세션 시작·종료 등)은 Amplitude 사본에 같은 이름으로 이미 있어 다시 보내지 않는다.
 *
 * SDK 루트는 네이티브 모듈 없이(jest·plugin 없는 빌드) 불러오면 안 되므로 `extra.airbridgeEnabled`를 본 뒤에만
 * `require`한다(`metaAdsSdk.ts`와 같은 이유). 꺼진 빌드에서는 전부 no-op이다.
 */

type Attributes = Record<string, string | number | boolean>;

let sdk: typeof AirbridgeSdk.Airbridge | null | undefined;

function airbridge(): typeof AirbridgeSdk.Airbridge | null {
  if (sdk !== undefined) return sdk;
  sdk = null;
  if (Constants.expoConfig?.extra?.airbridgeEnabled !== true) return sdk;
  // SDK는 불러오는 순간 네이티브 모듈로 이벤트 emitter를 만들어, 모듈이 없는 바이너리(토큰 든 Metro에 붙인
  // 이전 Dev Client)에서는 여기서 던진다. 분석 실패가 가입·브리지 처리를 끊지 않도록 꺼진 채로 둔다.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 조건부 동기 로드는 require뿐이다.
    sdk = (require("airbridge-react-native-sdk") as typeof AirbridgeSdk).Airbridge;
  } catch (error) {
    console.warn("[airbridge] SDK 로드 실패 — 이 실행에서는 끈다", error);
  }
  return sdk;
}

function track(category: string, semantic: Attributes = {}, custom: Attributes = {}): void {
  const client = airbridge();
  if (client === null) return;
  if (__DEV__) {
    console.warn("[airbridge] → SDK", category, semantic, custom);
  }
  try {
    client.trackEvent(category, semantic, custom);
  } catch (error) {
    console.warn("[airbridge] 이벤트 기록 실패", category, error);
  }
}

/** 웹 Amplitude 이벤트의 사본 → 커스텀 이벤트. 이름·값 형식은 `webBridge.ts`가 이미 걸렀다. */
export function trackAirbridgeAnalyticsEvent(
  name: string,
  params?: Record<string, AnalyticsEventParamValue>,
): void {
  track(name, {}, params);
}

function semantic(key: string, value: MetaAppEventParamValue | undefined): Attributes {
  return value === undefined ? {} : { [key]: String(value) };
}

/** Meta 전환 이름 → Airbridge 표준 이벤트. 표에 없는 전환은 Amplitude 사본으로 이미 간다. */
const STANDARD_CONVERSIONS: Record<
  string,
  (params: Record<string, MetaAppEventParamValue>) => [string, Attributes]
> = {
  fb_mobile_complete_registration: () => ["airbridge.user.signup", {}],
  fb_mobile_tutorial_completion: () => ["airbridge.completeTutorial", {}],
  fb_mobile_achievement_unlocked: (p) => [
    "airbridge.unlockAchievement",
    semantic("achievementID", p.fb_description),
  ],
  invite_shared: (p) => ["airbridge.share", semantic("sharedChannel", p.method)],
};

/** 광고 전환(`meta-app-event`·가입 완료)을 Airbridge 표준 이벤트로 보낸다. */
export function trackAirbridgeConversion(
  metaName: string,
  params: Record<string, MetaAppEventParamValue> = {},
): void {
  const toStandard = STANDARD_CONVERSIONS[metaName];
  if (toStandard === undefined) return;
  const [category, attributes] = toStandard(params);
  track(category, attributes);
}
