import { useQuery } from "@tanstack/react-query";

import { periodStatsQuery } from "@/lib/statsQueries";

import { weekRanges } from "./recordsPeriod";
import { derivePeriodState, type RecordsPeriodState } from "./useRecordsData";

/**
 * 기록 주간탭에서 사용하는 데이터 훅
 *
 * 그 주(월~일)를 `GET /api/stats/period` 하나로 조회해, 화면이 상태만 알고 데이터 배선은 모르도록 한다.
 * 직전 주를 compareRange로 함께 받아 추이 카드의 비교 문장과 막대를 앱이 계산한다(`recordsPeriod`).
 *
 * period는 placeholderData를 쓰지 않는다
 * — 주를 넘기면 새 조회가 끝날 때까지 data가 undefined로 즉시 비워져 pending으로 떨어지고,
 * 이전 주의 막대·문장이 새 제목 아래 남지 않는다(useRecordsData.period와 동일).
 *
 * 리듬 데이터는 이번엔 없다(예상 화면 고정이라 이 훅에서 다루지 않는다).
 */
export function useWeeklyData(
  userId: number | null,
  weekAnchorKey: string,
): { week: RecordsPeriodState } {
  const weekRange = weekRanges(weekAnchorKey);
  const week = useQuery({
    ...periodStatsQuery(userId ?? 0, weekRange.range, weekRange.compareRange),
    enabled: userId != null,
  });

  return { week: derivePeriodState(week) };
}
