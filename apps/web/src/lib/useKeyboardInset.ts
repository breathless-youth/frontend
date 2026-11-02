import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  const viewport = window.visualViewport;
  if (!viewport) {
    return () => {};
  }
  // 키보드가 올라오면 보이는 영역의 높이가 줄고, 그 상태로 페이지가 밀리면 위치만 바뀐다.
  viewport.addEventListener("resize", onChange);
  viewport.addEventListener("scroll", onChange);
  return () => {
    viewport.removeEventListener("resize", onChange);
    viewport.removeEventListener("scroll", onChange);
  };
}

function readInset(): number {
  const viewport = window.visualViewport;
  if (!viewport) {
    return 0;
  }
  // 보이는 영역이 창보다 크게 잡히는 순간에도 버튼이 화면 아래로 내려가지 않게 0에서 멈춘다.
  return Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
}

const serverInset = () => 0;

/**
 * 가상 키보드가 가린 화면 아래 높이(px)
 *
 * iOS 웹뷰는 키보드가 올라와도 레이아웃 높이가 그대로라 창 높이와 보이는 영역의 차이로 잰다.
 * Android 웹뷰는 키보드만큼 창이 줄어 차이가 0이 되므로 따로 나누지 않는다.
 * `visualViewport`가 없는 웹뷰에서는 0이라 버튼이 화면 아래에 그대로 남는다.
 */
export function useKeyboardInset(): number {
  return useSyncExternalStore(subscribe, readInset, serverInset);
}
