/**
 * Meta(Facebook) 광고 SDK 통로 — 앱 설치 어트리뷰션과 앱 내 전환 이벤트.
 *
 * 앱 설치 광고의 성과는 웹뷰 안 Pixel로는 잴 수 없다 — 설치 이벤트와 iOS SKAdNetwork 전환값은 네이티브
 * SDK만 다룬다. 그래서 SDK는 네이티브에 두고, 설치·앱 실행은 SDK의 자동 로깅(`autoLogAppEventsEnabled`)에
 * 맡기며, 앱 내 전환은 두 경로로 모은다.
 *
 * - 네이티브가 아는 전환: 가입 완료(`lib/userApi.ts`의 신규 등록 → `logMetaRegistration`).
 * - 웹이 아는 전환: 브리지 `meta-app-event`(`lib/nativeBridgeHandler.ts`) → `logMetaAppEvent`. 이벤트 정의는
 *   웹(`apps/web/src/lib/metaAppEvents.ts`)이 소유해 전환 목록이 바뀌어도 앱을 다시 빌드하지 않는다.
 *
 * ## 이 모듈은 SDK를 import하지 않는다
 *
 * `react-native-fbsdk-next`는 루트 index를 로드하는 순간 네이티브 모듈 없이 죽는다(jest에서 `NativeEventEmitter`
 * invariant). 이 모듈은 `userApi`·`nativeBridgeHandler`·`webBridge`가 끌어와 테스트 대부분이 지나가므로,
 * SDK 호출은 `lib/metaAdsSdk.ts`의 어댑터에 두고 `app/_layout.tsx`가 모듈 스코프에서 붙인다
 * (`lib/remoteConfig.ts`의 `set*Adapter`와 같은 꼴). 어댑터가 없거나(Meta env 없는 빌드) 붙기 전이면 전부
 * no-op이다 — 분석 유실이 화면 동작을 막으면 안 된다(`lib/nativeAnalytics.ts`와 같은 태도).
 *
 * ## 이벤트는 초기화가 끝난 뒤에 보낸다
 *
 * iOS는 ATT 응답을 `setAdvertiserTrackingEnabled`로 SDK에 알린 **뒤**에 보낸 이벤트만 광고 식별자 매칭에
 * 쓰인다. 가입 완료는 첫 실행의 등록 API 응답 직후라 사용자가 ATT에 답하기 전에 나오므로, 초기화가 끝날
 * 때까지 큐에 두었다가 순서대로 흘린다. 초기화가 실패해도 큐는 흘린다 — SKAdNetwork 경로는 ATT와 무관하다.
 */

/** Meta 앱 이벤트 파라미터 — SDK 계약(`Params`)이 문자열·수만 받는다. boolean은 발신자가 1/0으로 접는다. */
export type MetaAppEventParams = Record<string, string | number>;

export type MetaAdsAdapter = {
  /** SDK 초기화. 네이티브 auto-init(`isAutoInitEnabled`)과 겹쳐도 무해하다. */
  initialize(): void;
  /**
   * iOS ATT 프롬프트. 이미 답했으면 OS가 저장된 값을 즉시 돌려주고 다시 묻지 않는다.
   * Android·iOS 13 이하는 항상 true(expo-tracking-transparency 계약).
   */
  requestTrackingPermission(): Promise<boolean>;
  /** iOS `Settings.setAdvertiserTrackingEnabled` + 광고 식별자 수집 여부. Android는 no-op. */
  setAdvertiserTrackingEnabled(enabled: boolean): Promise<void>;
  logEvent(
    name: string,
    params: MetaAppEventParams | undefined,
    valueToSum: number | undefined,
  ): void;
};

/** Meta 표준 이벤트 "가입 완료" — SDK의 `AppEventsLogger.AppEvents.CompletedRegistration`과 같은 값이다. */
export const META_EVENT_COMPLETED_REGISTRATION = "fb_mobile_complete_registration";

/**
 * Meta 앱 이벤트 이름·파라미터 키 형식 — 영문자로 시작, 영숫자·`_`·`-`·공백, 40자 이내(Meta 앱 이벤트 규칙).
 * 웹이 보낸 이름은 `lib/webBridge.ts`가 이 형식으로 거른다.
 */
export const META_EVENT_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_\- ]{0,39}$/;
/** 이벤트 하나에 실을 수 있는 파라미터 상한(Meta 규칙 25개). */
export const META_EVENT_MAX_PARAMS = 25;

type PendingEvent = { name: string; params?: MetaAppEventParams; valueToSum?: number };

/** 초기화 전에 쌓아 둘 최대 건수 — 첫 실행의 가입 완료 한두 건이 전부라 넉넉하다. 넘치면 오래된 것부터 버린다. */
const MAX_PENDING = 50;

let adapter: MetaAdsAdapter | null = null;
let ready = false;
let pending: PendingEvent[] = [];
let initPromise: Promise<void> | null = null;

/** Meta env가 있는 빌드에서만 `app/_layout.tsx`가 붙인다(`lib/metaAdsSdk.ts`의 `installMetaAdsSdk`). */
export function setMetaAdsAdapter(next: MetaAdsAdapter | null): void {
  adapter = next;
}

/**
 * SDK 초기화와 ATT 프롬프트. 프로세스당 한 번만 실제로 돌고 이후 호출은 같은 프라미스를 돌려준다 — 권장
 * 업데이트 알림창(`app/_layout.tsx`)이 이 프라미스를 기다려 OS 알림창 두 개가 겹치지 않게 한다.
 * 어댑터가 없으면 즉시 끝난다.
 */
export function initMetaAds(): Promise<void> {
  initPromise ??= runInit();
  return initPromise;
}

async function runInit(): Promise<void> {
  const sdk = adapter;
  if (sdk === null) {
    return;
  }
  try {
    sdk.initialize();
    const granted = await sdk.requestTrackingPermission();
    await sdk.setAdvertiserTrackingEnabled(granted);
  } catch (error) {
    console.warn("[meta-ads] 초기화·추적 동의 처리 실패 — 이벤트는 계속 보낸다", error);
  }
  ready = true;
  for (const event of pending.splice(0)) {
    send(sdk, event);
  }
}

/**
 * 앱 이벤트를 기록한다. 어댑터가 없으면 버리고, 초기화 전이면 큐에 두었다가 초기화 뒤 순서대로 보낸다.
 * 호출부는 결과를 기다리거나 실패를 처리할 것이 없다.
 */
export function logMetaAppEvent(
  name: string,
  params?: MetaAppEventParams,
  valueToSum?: number,
): void {
  if (adapter === null) {
    return;
  }
  const event: PendingEvent = {
    name,
    ...(params !== undefined ? { params } : {}),
    ...(valueToSum !== undefined ? { valueToSum } : {}),
  };
  if (!ready) {
    pending.push(event);
    if (pending.length > MAX_PENDING) {
      pending.shift();
    }
    return;
  }
  send(adapter, event);
}

/** 가입 완료(Meta 표준 이벤트) — `lib/userApi.ts`가 서버 `isNew`로 신규 등록일 때만 부른다. */
export function logMetaRegistration(): void {
  logMetaAppEvent(META_EVENT_COMPLETED_REGISTRATION);
}

function send(sdk: MetaAdsAdapter, event: PendingEvent): void {
  try {
    sdk.logEvent(event.name, event.params, event.valueToSum);
  } catch (error) {
    console.warn("[meta-ads] 앱 이벤트 기록 실패", event.name, error);
  }
}

/** 테스트 전용: 어댑터·큐·초기화 상태를 비운다. 프로덕션 코드에서는 호출하지 않는다. */
export function __resetMetaAdsForTests(): void {
  adapter = null;
  ready = false;
  pending = [];
  initPromise = null;
}
