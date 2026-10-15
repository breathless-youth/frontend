import type { RankingOvertaker } from "@focusmakers/types";

import { formatGapDuration } from "../model/format";

/**
 * 추월한 사람과의 차이
 *
 * 지금 나보다 앞선 만큼이라 `+`를 붙인다.
 */
export function formatOvertakeGap(gap: number): string {
  return `+${formatGapDuration(gap)}`;
}

/**
 * 강조할 차이
 *
 * 가장 따라잡기 쉬운 사람, 곧 차이가 가장 작은 줄을 강조한다.
 * 사람이 없으면 null이다.
 */
export function closestGap(nearest: readonly RankingOvertaker[]): number | null {
  return nearest.length === 0 ? null : Math.min(...nearest.map((person) => person.gap));
}
