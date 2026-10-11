import type { RankingRecord } from "@focusmakers/types";

import { recordMonthKey } from "./format";

export interface RecordMonthGroup {
  key: string;
  label: string;
  items: RankingRecord[];
}

/**
 * 달별 기록 묶음
 *
 * 같은 달끼리 묶고 묶음은 최근 달부터 둔다.
 * 묶음 안의 기록은 서버가 준 마감 시각 내림차순을 그대로 지킨다.
 * 달이 걸친 주간 기록은 마감이 다음 달이라 다른 달 기록 사이에 낄 수 있어 바로 앞 묶음만 보지 않는다.
 */
export function groupRecordsByMonth(
  items: readonly RankingRecord[],
  currentYear: number,
): RecordMonthGroup[] {
  const groups = new Map<string, RecordMonthGroup>();
  for (const item of items) {
    const key = recordMonthKey(item);
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
      continue;
    }
    const [year, month] = key.split("-").map(Number);
    groups.set(key, {
      key,
      label: year === currentYear ? `${month}월` : `${year}년 ${month}월`,
      items: [item],
    });
  }
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
}
