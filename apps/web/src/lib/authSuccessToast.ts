import { useEffect } from "react";

import { subscribeToNativeMessages } from "./bridge";
import i18n from "./i18n";
import { showToast } from "./toast";

// StrictMode 재구독과 같은 완료 이벤트의 재전달도 한 번으로 취급한다. 계정 정보는 보관하지 않는다.
const completedAt = new Map<string, number>();

/** 로그인 화면이 게이트 전환으로 먼저 내려가도 현재 문서에서 성공을 알린다. */
export function notifyLoginSuccess(): void {
  showToast(i18n.t("common:authSuccess.login"), { persistOnNavigation: true });
}

/**
 * AppToaster에서 구독한다. 자식 effect가 analytics-ready를 보내는 부모 effect보다 먼저 돈다.
 * 로그아웃·삭제 완료는 앱이 새 활성 문서에 한 번 전달하는 기존 이벤트를 쓴다.
 * 원래 요청의 result는 곧 사라질 설정 문서에 오므로 거기서는 성공 토스트를 띄우지 않는다.
 * SDK 초기화·분석 동의와 무관하게 브리지의 완료 메시지만 받는다.
 */
export function useAuthSuccessToast(): void {
  useEffect(() => {
    return subscribeToNativeMessages((message) => {
      if (message.type !== "track-event") return;
      const key =
        message.name === "logout_completed"
          ? "logout"
          : message.name === "account_deleted"
            ? "deleted"
            : null;
      if (key === null || message.atMs <= (completedAt.get(key) ?? -Infinity)) return;
      completedAt.set(key, message.atMs);
      showToast(i18n.t(`common:authSuccess.${key}`), { persistOnNavigation: true });
    });
  }, []);
}

/** 테스트 간 완료 이벤트와 문서 메모리를 분리한다. */
export function __resetAuthSuccessToastForTests(): void {
  completedAt.clear();
}
