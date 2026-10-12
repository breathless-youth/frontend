import { focusManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { isNativeBridgeAvailable, subscribeToNativeMessages } from "./bridge";

let tabFocused = true;

/**
 * 탭 웹뷰 보임 신호 연결
 *
 * 네이티브 탭은 웹뷰를 띄워 둔 채 바뀌어 문서에 visibilitychange가 오지 않는다.
 * 셸의 tab-focus와 문서 가시성을 함께 봐야 가려진 탭의 폴링과 tick이 멈춘다.
 * focusManager는 문서 전체에 하나라 홈·기록 탭도 다시 보일 때 낡은 쿼리를 새로 받는다.
 * 첫 tab-focus 전에는 보이는 것으로 보고, 셸이 없는 브라우저는 TanStack 기본 동작을 쓴다.
 */
export function initNativeTabFocus(): void {
  if (!isNativeBridgeAvailable()) {
    return;
  }
  focusManager.setEventListener((setFocused) => {
    const update = () => setFocused(tabFocused && document.visibilityState === "visible");
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type !== "tab-focus") {
        return;
      }
      tabFocused = message.focused;
      update();
    });
    document.addEventListener("visibilitychange", update);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", update);
    };
  });
}

function subscribe(onChange: () => void): () => void {
  return focusManager.subscribe(onChange);
}

function isFocused(): boolean {
  return focusManager.isFocused();
}

/**
 * 화면이 지금 보이는지
 *
 * 폴링을 멈추는 기준과 같다.
 */
export function useScreenVisible(): boolean {
  return useSyncExternalStore(subscribe, isFocused);
}

/**
 * 테스트용 보임 상태 초기화
 *
 * 테스트마다 TanStack 기본 동작으로 되돌린다.
 */
export function __resetNativeTabFocusForTests(): void {
  tabFocused = true;
  focusManager.setEventListener((setFocused) => {
    const listener = () => setFocused();
    window.addEventListener("visibilitychange", listener, false);
    return () => window.removeEventListener("visibilitychange", listener);
  });
  focusManager.setFocused(undefined);
}
