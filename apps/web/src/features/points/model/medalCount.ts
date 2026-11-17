import type { MedalReward } from "../types";

// 개수가 늘어도 줄 너비가 바뀌지 않게 99를 넘으면 `99+`로 줄인다.
const SHOWN_MAX = 99;

/** 메달 개수를 글자로 보일 때의 값 */
export function shownCount(count: number): string {
  return count > SHOWN_MAX ? `${SHOWN_MAX}+` : String(count);
}

/** 받을 메달을 순위별로 센 수이며 없는 순위는 0이다. */
export function medalsByRank(medals: readonly MedalReward[]): Record<MedalReward["rank"], number> {
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const medal of medals) {
    counts[medal.rank] += 1;
  }
  return counts;
}
