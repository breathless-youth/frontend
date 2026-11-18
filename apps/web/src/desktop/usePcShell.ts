import { useSyncExternalStore } from "react";

import { isNativeBridgeAvailable } from "@/lib/bridge";

// index.css의 lg 브레이크포인트(75rem)와 같은 값이어야 PC 셸과 lg: 배치가 같은 폭에서 바뀐다.
const PC_QUERY = "(min-width: 75rem)";

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(PC_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function readWide() {
  return typeof window.matchMedia === "function" && window.matchMedia(PC_QUERY).matches;
}

/**
 * PC 셸을 그릴지 판정
 *
 * 앱 웹뷰는 태블릿 가로에서도 폭이 1200을 넘지만 네이티브 탭 바가 있어 넓이와 상관없이 모바일 화면을 쓴다.
 * 창 크기를 바꾸면 미디어 쿼리 변경을 구독해 새로고침 없이 바로 바뀐다.
 */
export function usePcShell(): boolean {
  const wide = useSyncExternalStore(subscribe, readWide);
  return wide && !isNativeBridgeAvailable();
}
