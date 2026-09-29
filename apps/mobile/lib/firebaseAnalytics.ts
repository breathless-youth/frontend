import type { AnalyticsEventParamValue } from "@focusmakers/types";

/**
 * Firebase Analytics(GA4) 통로 — FCM 콘솔의 오디언스·유저 속성 타겟팅이 보는 데이터다.
 *
 * 분석의 원천은 여전히 웹 Amplitude다(`lib/nativeAnalytics.ts`). 이 모듈은 그 사본을 Firebase에도 남긴다:
 * 웹이 브리지 `analytics-event`·`analytics-user-properties`로 보내면(`lib/nativeBridgeHandler.ts`) SDK에
 * 넘기고, 백엔드 userId를 GA user_id로 붙인다(`lib/firebaseAnalyticsSdk.ts`).
 *
 * ## 이 모듈은 SDK를 import하지 않는다
 *
 * `@react-native-firebase/*`는 네이티브 모듈 없이(jest) 로드 시점에 죽는다. `lib/metaAds.ts`와 같은 꼴로
 * SDK 호출은 `lib/firebaseAnalyticsSdk.ts`의 어댑터에 두고 `app/_layout.tsx`가 모듈 스코프에서 붙인다.
 * 어댑터가 없으면 전부 no-op이다 — 분석 유실이 화면 동작을 막으면 안 된다.
 */

export type AnalyticsEventParams = Record<string, AnalyticsEventParamValue>;

export type FirebaseAnalyticsAdapter = {
  /** RNFB의 `logEvent`는 void를 돌려주고 나머지는 promise다 — 둘 다 받는다. */
  logEvent(name: string, params: AnalyticsEventParams | undefined): void | Promise<void>;
  setUserId(id: string | null): Promise<void>;
  setUserProperties(properties: Record<string, string>): Promise<void>;
};

/** Firebase 이벤트명·파라미터 키 형식 — 영문자로 시작, 영숫자·`_`, 40자 이내. 웹이 보낸 이름은 `lib/webBridge.ts`가 이 형식으로 거른다. */
export const ANALYTICS_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
/** 유저 속성 키 형식 — 이벤트명과 같은 문자 집합, 24자 이내. */
export const ANALYTICS_USER_PROPERTY_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
export const ANALYTICS_EVENT_MAX_PARAMS = 25;
export const ANALYTICS_PARAM_VALUE_MAX_LENGTH = 100;
export const ANALYTICS_USER_PROPERTY_VALUE_MAX_LENGTH = 36;
/** Firebase가 자기 몫으로 예약한 접두사 — 이 이름으로 부르면 SDK가 예외를 던진다. */
const RESERVED_PREFIXES = ["firebase_", "google_", "ga_"];

let adapter: FirebaseAnalyticsAdapter | null = null;

/** `app/_layout.tsx`가 모듈 스코프에서 붙인다(`lib/firebaseAnalyticsSdk.ts`). 테스트는 가짜 어댑터를 넣는다. */
export function setFirebaseAnalyticsAdapter(next: FirebaseAnalyticsAdapter | null): void {
  adapter = next;
}

export function isReservedAnalyticsName(name: string): boolean {
  const lower = name.toLowerCase();
  return RESERVED_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * SDK 호출 실패를 경고로 끝낸다. RNFB는 형식 검증에 걸리면 promise 이전에 동기로 던지므로(예약 이벤트명 등)
 * 동기 예외와 거부를 둘 다 받는다.
 */
function run(action: string, call: () => void | Promise<void>): void {
  const warn = (error: unknown) => console.warn(`[firebase-analytics] ${action} 실패`, error);
  try {
    Promise.resolve(call()).catch(warn);
  } catch (error) {
    warn(error);
  }
}

export function logAnalyticsEvent(name: string, params?: AnalyticsEventParams): void {
  if (adapter === null || isReservedAnalyticsName(name)) return;
  const current = adapter;
  run(`logEvent(${name})`, () => current.logEvent(name, params));
}

export function setAnalyticsUserId(id: string | null): void {
  if (adapter === null) return;
  const current = adapter;
  run("setUserId", () => current.setUserId(id));
}

export function setAnalyticsUserProperties(properties: Record<string, string>): void {
  if (adapter === null) return;
  const allowed = Object.fromEntries(
    Object.entries(properties).filter(([key]) => !isReservedAnalyticsName(key)),
  );
  if (Object.keys(allowed).length === 0) return;
  const current = adapter;
  run("setUserProperties", () => current.setUserProperties(allowed));
}

/** 테스트 전용. */
export function __resetFirebaseAnalyticsForTests(): void {
  adapter = null;
}
