/**
 * 공부 중 숫자 색
 *
 * 집중률 색으로 지금 상태를 구분하고, 일시정지면 흐르지 않는 숫자를 모두 회색으로 눌러 둔다.
 * 비집중 주황은 모바일 세션의 비집중 표시와 같은 색이다.
 */
export type StudyTone = "focus" | "distract" | "pause";

export const STUDY_RATE_CLASS: Record<StudyTone, string> = {
  focus: "text-primary",
  distract: "text-state-distract",
  pause: "text-state-pause",
};
