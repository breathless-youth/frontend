import { useSyncExternalStore } from "react";

const WIDE_QUERY = "(min-width: 37.5rem)";
// index.css의 landscape-compact와 같은 조건이다.
// 범위 문법을 못 읽는 옛 WebKit을 위해 max-height로 쓴다.
const PHONE_LANDSCAPE_QUERY = "(orientation: landscape) and (max-height: 29.99rem)";

function readRegular(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia(WIDE_QUERY).matches && !window.matchMedia(PHONE_LANDSCAPE_QUERY).matches;
}

function subscribeRegular(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const lists = [window.matchMedia(WIDE_QUERY), window.matchMedia(PHONE_LANDSCAPE_QUERY)];
  for (const list of lists) list.addEventListener("change", onChange);
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange);
  };
}

/**
 * Tailwind `regular` variant와 같은 창 판정
 *
 * CSS로 숨기기만 하면 이미지 요청과 깜빡임 타이머가 남아서, 마운트 여부를 JS로 정할 때 쓴다.
 */
export function useRegularWindow(): boolean {
  return useSyncExternalStore(subscribeRegular, readRegular, () => false);
}
