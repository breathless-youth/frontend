/**
 * 집중률 = 순공시간 / 총공부시간.
 * - 총공부시간이 0 이하이거나 유한하지 않으면 0.
 * - 순공시간이 음수/비유한이면 0으로 정규화.
 * - 순공시간이 총공부시간을 초과해도 1을 넘지 않는다.
 * 반환 범위는 항상 0~1.
 */
export function computeFocusRate(pureStudySeconds: number, totalStudySeconds: number): number {
  if (!Number.isFinite(totalStudySeconds) || totalStudySeconds <= 0) {
    return 0;
  }
  const safePure = Number.isFinite(pureStudySeconds) ? Math.max(0, pureStudySeconds) : 0;
  const clampedPure = Math.min(safePure, totalStudySeconds);
  const rate = clampedPure / totalStudySeconds;
  return Math.min(1, Math.max(0, rate));
}
