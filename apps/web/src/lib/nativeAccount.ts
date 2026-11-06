import type { DeleteAccountFailureCode, SocialLoginProvider } from "@focusmakers/types";

import { isNativeBridgeAvailable, postToNative, subscribeToNativeMessages } from "./bridge";

export type NativeAccountResult =
  | { status: "success" }
  | { status: "cancelled" }
  | { status: "failed"; code: DeleteAccountFailureCode };

// 앱 안 이동은 URL에서 쿼리를 없애므로 처음 읽은 표시를 보관한다.
// 표시는 바이너리마다 고정이라 다시 읽을 이유가 없다.
function readAccountActionsFlag(): boolean {
  return new URLSearchParams(window.location.search).get("accountActions") === "1";
}

let flagCache: boolean | null = readAccountActionsFlag();

/**
 * 로그아웃과 계정 삭제를 앱에 맡길 수 있는지
 *
 * 앱이 웹뷰 주소에 `accountActions=1`을 붙인다(`apps/mobile/lib/remoteQueryParams.ts`).
 * 원격 웹은 구버전 앱에도 바로 배포되고, 그 앱은 로그인은 되지만 이 메시지를 버려 누른 버튼이 답을 받지 못한다.
 */
export function hasNativeAccountActions(): boolean {
  flagCache ??= readAccountActionsFlag();
  return flagCache && isNativeBridgeAvailable();
}

/** 테스트마다 URL을 다시 읽게 하는 캐시 초기화 */
export function __resetNativeAccountForTests(): void {
  flagCache = null;
}

/**
 * 요청을 보내고 같은 `id`의 답 기다리기
 *
 * 애플 계정은 다시 로그인하는 창에 머무는 시간을 정할 수 없어 시간 제한 없이 기다린다.
 * 구독을 먼저 걸고 보내야 빠른 응답을 놓치지 않는다.
 */
function requestAccountAction(request: {
  type: "logout" | "delete-account";
  provider: SocialLoginProvider;
}): Promise<NativeAccountResult> {
  // LAN 주소(http)로 연 개발 웹뷰는 비보안 문서라 randomUUID가 없다.
  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Math.random());
  return new Promise((resolve) => {
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type === "logout-result" && message.id === id) {
        unsubscribe();
        resolve({ status: "success" });
      } else if (message.type === "delete-account-result" && message.id === id) {
        unsubscribe();
        resolve(
          message.status === "failed"
            ? { status: "failed", code: message.code }
            : { status: message.status },
        );
      }
    });
    if (!postToNative({ ...request, id, atMs: Date.now() })) {
      unsubscribe();
      resolve({ status: "failed", code: "UNKNOWN" });
    }
  });
}

/**
 * 앱에 이 기기 로그아웃 요청하기
 *
 * 앱은 서버 응답과 상관없이 토큰을 지우고 새 비회원이 된 뒤 답하고, 곧 모든 탭 웹뷰를 다시 띄운다.
 * 공급자는 앱이 남기는 완료 이벤트에 싣는다.
 */
export function requestNativeLogout(provider: SocialLoginProvider): Promise<NativeAccountResult> {
  return requestAccountAction({ type: "logout", provider });
}

/**
 * 앱에 계정 삭제 요청하기
 *
 * 애플 계정이면 앱이 애플 로그인을 다시 띄우므로 로그인 공급자를 함께 보낸다.
 * 성공하면 앱이 로그아웃처럼 모든 탭 웹뷰를 다시 띄운다.
 */
export function requestNativeDeleteAccount(
  provider: SocialLoginProvider,
): Promise<NativeAccountResult> {
  return requestAccountAction({ type: "delete-account", provider });
}
