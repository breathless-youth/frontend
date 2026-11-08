export const GOAL_STEP_SECONDS = 30 * 60;
export const MAX_GOAL_SECONDS = 24 * 60 * 60;
export const GOAL_PRESET_HOURS = [4, 6, 8, 10] as const;

/** 서버의 유효한 기존 초값은 보존하고 입력 범위만 제한한다. */
export function clampGoalSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  return Math.min(MAX_GOAL_SECONDS, Math.max(0, seconds));
}
