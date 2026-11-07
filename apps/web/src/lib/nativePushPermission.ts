import { isNativeBridgeAvailable, postToNative, subscribeToNativeMessages } from "./bridge";

export type PushPermissionResult = "granted" | "denied" | "undetermined" | "unsupported";

/**
 * 앱 응답 한도
 *
 * 앱은 시작 ATT 창이 끝난 뒤에 알림 권한 창을 띄우므로 사람이 창 두 개에 답하는 시간이 이 안에 들어간다.
 * 이 시간까지 답이 없으면 온보딩이 멈추지 않도록 미결정으로 끝낸다.
 */
const RESULT_TIMEOUT_MS = 120_000;

// 앱 안 이동은 URL에서 쿼리를 지우므로 모듈을 읽는 시점에 한 번 판정해 보관한다.
function readPushPermissionFlag(): boolean {
  return new URLSearchParams(window.location.search).get("pushPermission") === "1";
}

let flagCache: boolean | null = readPushPermissionFlag();
let pending: Promise<PushPermissionResult> | null = null;

/**
 * 웹이 알림 권한을 요청할 수 있는 셸인지
 *
 * 셸이 웹뷰 주소에 싣는 `pushPermission=1`로 가른다.
 * 표시 없는 구버전 앱은 실행할 때 이미 물었고 이 메시지를 모른다.
 */
export function canRequestPushPermission(): boolean {
  flagCache ??= readPushPermissionFlag();
  return flagCache && isNativeBridgeAvailable();
}

/**
 * OS 알림 권한 요청
 *
 * 이미 답한 기기에서는 앱이 창 없이 저장된 답을 돌려준다.
 * 동시에 부르면 같은 결과를 나눠 받아 OS 창이 겹쳐 뜨지 않는다.
 */
export function requestPushPermission(): Promise<PushPermissionResult> {
  if (!canRequestPushPermission()) {
    return Promise.resolve("unsupported");
  }
  pending ??= new Promise((resolve) => {
    const settle = (result: PushPermissionResult) => {
      pending = null;
      unsubscribe();
      clearTimeout(timer);
      resolve(result);
    };
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type === "push-permission-result") {
        settle(message.status);
      }
    });
    const timer = setTimeout(() => settle("undetermined"), RESULT_TIMEOUT_MS);
    // 보내지 못했으면 응답도 오지 않으니 기다리지 않는다.
    if (!postToNative({ type: "request-push-permission", atMs: Date.now() })) {
      settle("undetermined");
    }
  });
  return pending;
}

let homeArrivalRequest: Promise<PushPermissionResult> | null = null;

/**
 * 온보딩을 거치지 않는 계정의 홈 도착 요청
 *
 * 홈은 탭을 오가며 다시 마운트되므로 문서당 한 번만 보낸다.
 * 이미 답한 기기에서는 앱이 창 없이 저장된 답을 돌려줘서 사용자에게는 처음 한 번만 보인다.
 */
export function requestPushPermissionOnHomeArrival(): Promise<PushPermissionResult> {
  homeArrivalRequest ??= requestPushPermission();
  return homeArrivalRequest;
}

/** 테스트마다 URL을 바꿔 판정하도록 캐시와 진행 중인 요청을 비운다. */
export function __resetNativePushPermissionForTests(): void {
  flagCache = null;
  pending = null;
  homeArrivalRequest = null;
}
