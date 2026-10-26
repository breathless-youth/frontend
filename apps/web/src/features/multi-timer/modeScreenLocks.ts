import { useEffect, useRef } from "react";

import { postToNative } from "@/lib/bridge";

/** 지금 history 항목이 모드 화면이 쌓은 항목인지 가리키는 키. */
const MODE_HISTORY_KEY = "sessionMode";

/**
 * 모드 화면이 열린 동안의 가장자리 스와이프 끄기
 *
 * 모드 화면은 URL을 바꾸지 않아 iOS 가장자리 스와이프가 세션 화면 미리보기를 끌어와 보인다.
 * 회전은 잠그지 않는다. 모드 화면도 폰 가로 배치를 CSS로 갖고 있다.
 */
export function useModeScreenLocks(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    postToNative({ type: "set-back-gesture", enabled: false, atMs: Date.now() });
    return () => {
      postToNative({ type: "set-back-gesture", enabled: true, atMs: Date.now() });
    };
  }, [active]);
}

/**
 * 측정 화면이 열릴 때 회전 허용 다시 알리기
 *
 * 회전 규칙의 주인은 솔로 세션 화면이고, 앱은 그 화면을 띄울 때 한 번만 회전을 푼다.
 * 웹이 회전 허용을 보낸 기록이 남은 채 웹뷰가 죽으면 앱은 복구하며 세로로 잠그고, 다시 그린 문서는 그 잠금을 모른다.
 * 그래서 문서가 새로 열릴 때마다 회전 허용을 다시 보낸다.
 * 이 화면은 이미 회전을 허용하는 앱 화면에만 실려 같은 값을 다시 보내도 바뀌는 것이 없고, 브라우저에서는 보내는 곳이 없다.
 */
export function useSessionRotationRestore(): void {
  useEffect(() => {
    postToNative({ type: "set-orientation", unlocked: true, atMs: Date.now() });
  }, []);
}

function modeEntryOnTop(): boolean {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null && MODE_HISTORY_KEY in state;
}

// 라우터 상태를 함께 복사해 두어야 이 항목에서도 라우터가 같은 화면으로 본다.
function pushModeEntry() {
  window.history.pushState({ ...(window.history.state ?? {}), [MODE_HISTORY_KEY]: true }, "");
}

/**
 * 모드 화면이 열린 동안 뒤로 가기 막기
 *
 * 모드는 끌 때 확인을 묻지 않아서, 뒤로 가기 한 번에 진행 중인 타이머가 사라지지 않게 ✕로만 끈다.
 * 열 때 항목을 하나 쌓고 그 항목을 떠나는 popstate가 오면 다시 쌓아 뒤로 가기가 아무 일도 하지 않게 한다.
 * 끌 때는 쌓아 둔 항목을 한 번 걷어 내고, 그 뒤의 popstate는 듣지 않는다.
 */
export function useModeHistoryHold(active: boolean): void {
  // 되돌리기는 popstate가 올 때까지 끝나지 않아서, 그사이 다시 걷어 내면 세션 화면 밖으로 나간다.
  const backPendingRef = useRef(false);

  useEffect(() => {
    const settle = () => {
      backPendingRef.current = false;
    };
    window.addEventListener("popstate", settle);
    return () => window.removeEventListener("popstate", settle);
  }, []);

  useEffect(() => {
    if (!active) return;
    // 앞으로 가기나 아직 처리되지 않은 되돌리기로 이미 모드 항목에 있으면 그 항목을 다시 쓴다.
    if (!modeEntryOnTop()) pushModeEntry();
    const handlePopState = () => {
      if (!modeEntryOnTop()) pushModeEntry();
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (!backPendingRef.current && modeEntryOnTop()) {
        backPendingRef.current = true;
        window.history.back();
      }
    };
  }, [active]);
}
