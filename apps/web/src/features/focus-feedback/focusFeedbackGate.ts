import type { FocusFeedbackState } from "./focusFeedbackStore";

/**
 * 집중 도움 설문 노출 판정
 *
 * 저장소를 만지지 않는 순수 함수라 화면과 테스트가 같은 규칙을 쓴다.
 * 순공시간과 관계없이 총 공부 시간이 30분 이상이면 묻는다.
 */

const FOCUS_FEEDBACK_MIN_STUDY_SEC = 30 * 60;
const FOCUS_FEEDBACK_INTERVAL_MS = 72 * 60 * 60 * 1000;

export function canShowFocusFeedback(
  state: FocusFeedbackState,
  studySec: number,
  nowMs: number,
): boolean {
  if (studySec < FOCUS_FEEDBACK_MIN_STUDY_SEC) {
    return false;
  }
  return state.lastShownAt === null || nowMs - state.lastShownAt >= FOCUS_FEEDBACK_INTERVAL_MS;
}
