import Constants from "expo-constants";
import type * as AirbridgeSdk from "airbridge-react-native-sdk";

import type { AnalyticsEventParamValue, MetaAppEventParamValue } from "@focusmakers/types";

/**
 * Airbridge(MMP) 인앱 이벤트·추적 링크 딥링크 통로.
 *
 * SDK는 꺼진 채로 시작하고(`airbridge.json`의 `autoStartTrackingEnabled: false`), `initMetaAds`가 받은 앱 추적(ATT)
 * 응답이 `setAirbridgeTrackingAllowed`로 들어온 뒤에야 수집을 켠다. iOS에서 추적을 거부하면 설치·실행·이벤트
 * 무엇도 Airbridge로 가지 않는다(개인정보 처리방침과 같은 약속). Android는 ATT가 없어 응답이 늘 허용이다.
 * 설치·실행은 수집이 켜질 때 SDK가 네이티브에서 스스로 잡는다.
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

/** null = 아직 ATT 응답 전. 그동안의 이벤트는 쌓아 뒀다가 허용이면 보내고 거부면 버린다. */
let allowed: boolean | null = null;
type Pending = [category: string, semantic: Attributes, custom: Attributes];
let pending: Pending[] = [];
/** 응답 전 이벤트 상한 — 첫 실행의 가입·온보딩 몇 건이면 넉넉하다. 넘치면 오래된 것부터 버린다. */
const MAX_PENDING = 50;

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
  if (client === null || allowed === false) return;
  if (allowed === null) {
    pending.push([category, semantic, custom]);
    if (pending.length > MAX_PENDING) pending.shift();
    return;
  }
  send(client, category, semantic, custom);
}

function send(
  client: typeof AirbridgeSdk.Airbridge,
  category: string,
  semantic: Attributes,
  custom: Attributes,
): void {
  if (__DEV__) {
    console.warn("[airbridge] → SDK", category, semantic, custom);
  }
  try {
    client.trackEvent(category, semantic, custom);
  } catch (error) {
    console.warn("[airbridge] 이벤트 기록 실패", category, error);
  }
}

/**
 * ATT 응답을 받아 수집을 켜거나 끈다. `initMetaAds`가 응답마다 부른다(제때 온 응답과 상한 뒤 늦게 온 응답 —
 * 같은 값이 두 번 올 수 있고 SDK 호출은 멱등이다). 거부면 `stopTracking`도 불러 이전 실행의 상태가 남지 않게 한다.
 */
export function setAirbridgeTrackingAllowed(granted: boolean): void {
  const client = airbridge();
  if (client === null) return;
  try {
    if (granted) client.startTracking();
    else client.stopTracking();
  } catch (error) {
    console.warn("[airbridge] 수집 상태 변경 실패", granted, error);
    // 켜기에 실패하면 응답 전 상태로 남겨 큐를 지킨다 — 같은 응답이 한 번 더 오면 그때 다시 켠다.
    // 끄기는 실패해도 거부로 확정한다. 자동 시작이 꺼져 있어 이 실행에서 켠 적이 없다.
    if (granted) return;
  }
  allowed = granted;
  const queued = pending.splice(0);
  if (granted) {
    for (const [category, semantic, custom] of queued) send(client, category, semantic, custom);
  }
}

/** 추적 링크 주소(`app.config.ts`의 `AIRBRIDGE_LINK_HOSTS`)와 SDK가 스킴 링크에 붙이는 표시. */
const AIRBRIDGE_LINK =
  /^https?:\/\/focusmakers\.(?:airbridge\.io|abr\.ge)(?:[/?#]|$)|[?&]airbridge_referrer=/i;

/**
 * Airbridge 추적 링크로 들어온 주소인가
 *
 * 이 주소는 SDK가 광고에 심은 원래 딥링크로 바꿔 `onAirbridgeDeepLink`로 넘긴다.
 * 라우터가 그대로 받으면 없는 화면이 뜨거나 같은 곳으로 두 번 이동하므로 `+native-intent`가 걸러 낸다.
 */
export function isAirbridgeLink(url: string): boolean {
  return AIRBRIDGE_LINK.test(url);
}

/**
 * 추적 링크가 연 딥링크 받기
 *
 * 앱이 깔려 있으면 링크를 누른 순간, 깔려 있지 않았으면 설치 뒤 첫 실행에 한 번(지연 딥링크) 온다.
 * 지연 딥링크는 수집이 켜진 뒤에만 오므로 iOS에서 앱 추적을 거부하면 오지 않는다.
 * 일반 링크는 `airbridge.json`의 `isHandleAirbridgeDeeplinkOnly`로 SDK가 넘기지 않는다.
 */
export function onAirbridgeDeepLink(handler: (url: string) => void): void {
  const client = airbridge();
  if (client === null) return;
  try {
    client.setOnDeeplinkReceived(handler);
  } catch (error) {
    console.warn("[airbridge] 딥링크 콜백 등록 실패", error);
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
