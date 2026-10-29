import { useEffect, useRef, useState } from "react";

import { useHideNativeTabBar } from "@/lib/nativeTabBar";

export type HomeMode = "reorder" | "edit";

/**
 * 홈 상태를 표시하는 history 항목의 키
 *
 * 상태에 들어갈 때 URL은 바꾸지 않고 항목을 하나 쌓아서, iOS 가장자리 스와이프와 브라우저 뒤로 가기가 홈이 아니라 상태만 닫게 한다.
 * 라우터 상태를 함께 복사해 두어 그 항목에서 뒤로 가도 라우터는 같은 화면으로 본다.
 */
const MODE_HISTORY_KEY = "homeMode";

function modeEntryOnTop(): boolean {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null && MODE_HISTORY_KEY in state;
}

/**
 * 홈의 과목 순서 변경·편집 상태
 *
 * 상태 동안 앱 탭 바를 숨긴다.
 * `완료`도 뒤로 가기와 같은 길로 닫아서 쌓은 항목이 남지 않는다.
 * 상태가 열린 채 화면이 내려가도 쌓은 항목을 되돌린다.
 */
export function useHomeMode() {
  const [mode, setMode] = useState<HomeMode | null>(null);
  // 되돌리기는 popstate가 올 때까지 끝나지 않는다. 그사이 한 번 더 되돌리면 홈 밖으로 나간다.
  const closingRef = useRef(false);
  useHideNativeTabBar(mode !== null);

  useEffect(() => {
    if (mode === null) {
      return;
    }
    const handlePopState = () => {
      closingRef.current = false;
      setMode(null);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      // 상태가 열린 채 홈이 내려가면 쌓은 항목이 남아 뒤로 가기를 한 번 더 해야 홈을 떠난다.
      // popstate로 닫힌 뒤에는 그 항목이 이미 위에 없어 되돌리지 않는다.
      if (!closingRef.current && modeEntryOnTop()) {
        closingRef.current = true;
        window.history.back();
      }
    };
  }, [mode]);

  return {
    mode,
    enter(next: HomeMode) {
      closingRef.current = false;
      // 앞으로 가기로 이미 표시 항목에 와 있으면 그 항목을 다시 쓴다. 하나 더 쌓으면 뒤로 가기를 두 번 해야 닫힌다.
      if (!modeEntryOnTop()) {
        window.history.pushState(
          { ...(window.history.state as object | null), [MODE_HISTORY_KEY]: next },
          "",
        );
      }
      setMode(next);
    },
    exit() {
      if (closingRef.current) {
        return;
      }
      if (modeEntryOnTop()) {
        closingRef.current = true;
        window.history.back();
        return;
      }
      setMode(null);
    },
  };
}
