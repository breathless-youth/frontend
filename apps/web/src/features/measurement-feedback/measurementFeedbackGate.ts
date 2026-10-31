import type { MeasurementFeedbackState } from "./measurementFeedbackStore";

/**
 * AI 측정 만족도 카드 노출 판정
 *
 * 저장소를 만지지 않는 순수 함수라 화면과 테스트가 같은 규칙을 쓴다.
 * 짧은 세션은 측정 결과를 판단할 근거가 적어서 순공 5분 이상인 세션에만 묻는다.
 */

const MEASUREMENT_FEEDBACK_MIN_FOCUS_SEC = 300;
const MEASUREMENT_FEEDBACK_INTERVAL_MS = 72 * 60 * 60 * 1000;

export function canShowMeasurementFeedback(
  state: MeasurementFeedbackState,
  focusSec: number,
  nowMs: number,
): boolean {
  if (focusSec < MEASUREMENT_FEEDBACK_MIN_FOCUS_SEC) {
    return false;
  }
  return (
    state.lastShownAt === null || nowMs - state.lastShownAt >= MEASUREMENT_FEEDBACK_INTERVAL_MS
  );
}
