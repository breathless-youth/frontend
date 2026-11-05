import type { SocialLoginFailureCode, SocialLoginProvider } from "@focusmakers/types";
import { SOCIAL_LOGIN_PROVIDERS } from "@focusmakers/types";

import { isNativeBridgeAvailable, postToNative, subscribeToNativeMessages } from "./bridge";
import { queryClient } from "./queryClient";

export type NativeSocialLoginResult =
  | { status: "success"; isNewUser: boolean }
  | { status: "cancelled" }
  | { status: "failed"; code: SocialLoginFailureCode };

// 앱 안 이동은 URL에서 쿼리를 없애므로 처음 읽은 목록을 보관한다.
// 목록은 바이너리마다 고정이라 다시 읽을 이유가 없다.
function readSocialLoginFlag(): SocialLoginProvider[] {
  const raw = new URLSearchParams(window.location.search).get("socialLogin") ?? "";
  return SOCIAL_LOGIN_PROVIDERS.filter((provider) => raw.split(",").includes(provider));
}

let providersCache: SocialLoginProvider[] | null = readSocialLoginFlag();

/**
 * 앱에 로그인을 맡길 수 있는 공급자
 *
 * 앱이 웹뷰 URL에 `socialLogin=GOOGLE,KAKAO,APPLE`처럼 붙인다(`apps/mobile/lib/remoteQueryParams.ts`).
 * 앱 종류와 플랫폼마다 목록이 달라서 웹은 이 목록 안의 공급자만 보인다.
 * 원격 웹은 구버전 앱에도 바로 배포되므로 브리지만 있고 목록이 없으면 이 메시지를 모르는 앱으로 본다.
 */
export function nativeSocialLoginProviders(): SocialLoginProvider[] {
  providersCache ??= readSocialLoginFlag();
  return isNativeBridgeAvailable() ? providersCache : [];
}

/** 테스트마다 URL을 다시 읽게 하는 캐시 초기화 */
export function __resetNativeSocialLoginForTests(): void {
  providersCache = null;
}

/**
 * 앱에 소셜 로그인 요청하기
 *
 * 앱이 SDK 로그인과 계정 연결을 마치고 새 토큰의 `auth-token`을 먼저 보낸 뒤 결과를 답한다.
 * 사용자가 로그인 창에 머무는 시간을 정할 수 없어 시간 제한 없이 기다린다.
 * 성공하면 비회원 기록이 기존 계정에 합쳐져 신원이 바뀌었을 수 있으므로 이 문서의 쿼리를 모두 다시 불러온다.
 * 구독을 먼저 걸고 보내야 빠른 응답을 놓치지 않는다.
 */
export function requestNativeSocialLogin(
  provider: SocialLoginProvider,
): Promise<NativeSocialLoginResult> {
  // LAN 주소(http)로 연 개발 웹뷰는 비보안 문서라 randomUUID가 없다.
  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Math.random());
  return new Promise((resolve) => {
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type !== "social-login-result" || message.id !== id) {
        return;
      }
      unsubscribe();
      if (message.status === "success") {
        void queryClient.invalidateQueries();
        resolve({ status: "success", isNewUser: message.isNewUser });
      } else if (message.status === "cancelled") {
        resolve({ status: "cancelled" });
      } else {
        resolve({ status: "failed", code: message.code });
      }
    });
    if (!postToNative({ type: "social-login", id, provider, atMs: Date.now() })) {
      unsubscribe();
      resolve({ status: "failed", code: "UNKNOWN" });
    }
  });
}
