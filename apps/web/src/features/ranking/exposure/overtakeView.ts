import type { RankingOvertaker } from "@focusmakers/types";

import type { DrawerCloseReason } from "@/components/ui/drawer";
import type { RankingOvertakeCloseMethod } from "@/lib/amplitude";

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

const CLOSE_METHODS: Partial<Record<DrawerCloseReason, RankingOvertakeCloseMethod>> = {
  swipe: "swipe",
  "outside-press": "outside",
  "escape-key": "escape",
  "close-press": "button",
  "close-watcher": "back",
};

/**
 * 추월 시트를 닫은 방법
 *
 * 시트가 넘기는 닫힌 이유를 분석 값으로 옮긴다. 사용자가 직접 닫은 경우가 아니면 값이 없다.
 */
export function overtakeCloseMethod(
  reason: DrawerCloseReason,
): RankingOvertakeCloseMethod | undefined {
  return CLOSE_METHODS[reason];
}
