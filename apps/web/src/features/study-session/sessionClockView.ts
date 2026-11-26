import type { SessionClockView } from "./components/SessionClock";

const KEY = "focuson.sessionClockView.v1";

/**
 * 공부 화면 시계 보기 형식
 *
 * 기본은 순공(`focus`)이고, 더보기 메뉴에서 공부 시간(`study`)으로 바꿀 수 있다.
 * 저장한 값이 없거나 저장소를 쓸 수 없는 창에서는 기본값으로 본다.
 */
export function readSessionClockView(): SessionClockView {
  try {
    return localStorage.getItem(KEY) === "study" ? "study" : "focus";
  } catch {
    return "focus";
  }
}

export function writeSessionClockView(view: SessionClockView): void {
  try {
    localStorage.setItem(KEY, view);
  } catch {
    // 저장하지 못해도 이번 화면의 보기는 상태로 바뀌므로 공부를 막지 않는다.
  }
}
