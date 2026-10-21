import { useState, useSyncExternalStore } from "react";

const LANDSCAPE_QUERY = "(orientation: landscape)";

/** 글자를 입력하는 요소인가 */
export function isTextEntry(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && target.type !== "range";
}

let lastLandscape = false;

function readLandscape(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  // Android는 키보드가 창 높이를 줄여 세로로 든 폰도 가로로 잡힌다.
  // 입력 중에 구조가 바뀌면 입력 줄이 다시 마운트되어 키보드가 닫히므로 직전 판정을 유지한다.
  if (isTextEntry(document.activeElement)) return lastLandscape;
  lastLandscape = window.matchMedia(LANDSCAPE_QUERY).matches;
  return lastLandscape;
}

function subscribeLandscape(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(LANDSCAPE_QUERY);
  media.addEventListener("change", onChange);
  document.addEventListener("focusout", onChange);
  return () => {
    media.removeEventListener("change", onChange);
    document.removeEventListener("focusout", onChange);
  };
}

const subscribeNothing = () => () => {};
const readPortrait = () => false;

/**
 * 세션 위 전체 페이지의 가로 판정
 *
 * 세로 카드 목록과 가로 목록·상세는 DOM 구조가 달라 CSS만으로 가르지 않는다.
 * 세션 화면 자체는 회전해도 DOM이 유지되어야 해서 페이지가 열려 있을 때만 구독한다.
 * 꺼진 뒤에는 마지막 판정을 돌려줘서, 닫히며 밀려 나가는 페이지가 그 사이 세로 구조로 바뀌어 보이지 않게 한다.
 */
export function useLandscapeLayout(enabled: boolean): boolean {
  const live = useSyncExternalStore(
    enabled ? subscribeLandscape : subscribeNothing,
    enabled ? readLandscape : readPortrait,
  );
  const [kept, setKept] = useState(live);
  if (enabled && kept !== live) {
    setKept(live);
  }
  return enabled ? live : kept;
}
