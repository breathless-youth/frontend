import type { ReviewLoginFailureCode } from "@focusmakers/types";

import {
  bridgeRequestId,
  isNativeBridgeAvailable,
  postToNative,
  subscribeToNativeMessages,
} from "./bridge";
import { queryClient } from "./queryClient";

export type NativeReviewLoginResult =
  { status: "success" } | { status: "failed"; code: ReviewLoginFailureCode };

// 앱이 서버 요청과 토큰 저장을 마치기까지 넉넉히 기다리고, 그래도 답이 없으면 창이 진행 중으로 남지 않게 실패로 끝낸다.
const RESULT_TIMEOUT_MS = 30_000;

// 서버가 `26.47.0`처럼 점으로 나눈 숫자만 받아서 다른 모양이면 묻지 않는다.
const APP_VERSION_PATTERN = /^\d+(\.\d+)*$/;

// 앱 안 이동은 URL에서 쿼리를 없애므로 처음 읽은 값을 보관한다.
function readAppVersion(): string | null {
  const params = new URLSearchParams(window.location.search);
  const appVersion = params.get("appVersion");
  return params.get("reviewLogin") === "1" &&
    appVersion !== null &&
    APP_VERSION_PATTERN.test(appVersion)
    ? appVersion
    : null;
}

let appVersionCache: string | null | undefined = readAppVersion();

/**
 * 앱에 심사용 로그인을 맡길 수 있으면 그 앱의 버전
 *
 * 앱이 웹뷰 주소에 `reviewLogin=1`과 `appVersion`을 붙인다(`apps/mobile/lib/remoteQueryParams.ts`).
 * 서버는 앱 버전으로 입구를 켤지 정하므로 버전을 모르는 브라우저와 표시 없는 구버전 앱은 null이다.
 */
export function nativeReviewLoginAppVersion(): string | null {
  if (appVersionCache === undefined) {
    appVersionCache = readAppVersion();
  }
  return isNativeBridgeAvailable() ? appVersionCache : null;
}

/** 테스트마다 URL을 다시 읽게 하는 캐시 초기화 */
export function __resetNativeReviewLoginForTests(): void {
  appVersionCache = undefined;
}

/**
 * 앱에 심사용 로그인 요청하기
 *
 * 토큰은 앱만 가지므로 서버 요청과 저장은 앱이 하고, 성공하면 새 토큰의 `auth-token`을 먼저 보낸 뒤 결과를 답한다.
 * 신원이 심사 계정으로 바뀌므로 성공하면 이 문서의 조회를 모두 다시 부른다.
 * 비밀번호는 이 메시지에만 싣고 로그나 분석 이벤트에 넘기지 않는다.
 * 앱이 30초 안에 답하지 않으면 다시 시도하도록 UNKNOWN 실패로 끝낸다.
 */
export function requestNativeReviewLogin(
  loginId: string,
  password: string,
): Promise<NativeReviewLoginResult> {
  const id = bridgeRequestId();
  return new Promise((resolve) => {
    const finish = (result: NativeReviewLoginResult) => {
      window.clearTimeout(timer);
      unsubscribe();
      resolve(result);
    };
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type !== "review-login-result" || message.id !== id) {
        return;
      }
      if (message.status === "success") {
        void queryClient.invalidateQueries();
        finish({ status: "success" });
      } else {
        finish({ status: "failed", code: message.code });
      }
    });
    const timer = window.setTimeout(
      () => finish({ status: "failed", code: "UNKNOWN" }),
      RESULT_TIMEOUT_MS,
    );
    if (!postToNative({ type: "review-login", id, loginId, password, atMs: Date.now() })) {
      finish({ status: "failed", code: "UNKNOWN" });
    }
  });
}
