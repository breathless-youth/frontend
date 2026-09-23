import { useQuery } from "@tanstack/react-query";

import type { StudyPeriodStatsResponse } from "@focusmakers/types";
import { periodStatsQuery } from "@/lib/statsQueries";

import type { CalendarMonth } from "./recordsFormat";
import { monthRanges, weekRanges } from "./recordsPeriod";
import type { RecordsPeriodState } from "./useRecordsData";

/**
 * 기록 주간탭에서 사용하는 데이터 훅
 *
 * 그 주(월~일)와 보이는 달을 각각 `GET /api/stats/period` 하나로 조회해, 화면이 상태만 알고 데이터 배선은 모르도록 한다.
 * 두 조회 모두 직전 기간을 compareRange로 함께 받아 헤더의 증감을 앱이 계산한다(`recordsPeriod.focusDeltaSec`).
 *
 * period는 placeholderData를 쓰지 않는다
 * — 주·달을 넘기면 새 조회가 끝날 때까지 data가 undefined로 즉시 비워져 pending으로 떨어지고,
 * 이전 기간 막대·증감이 새 제목 아래 남지 않는다(useRecordsData.period와 동일).
 *
 * 리듬 데이터는 이번엔 없다(준비 중 고정이라 이 훅에서 다루지 않는다).
 */
export function useWeeklyData(
  userId: number | null,
  weekAnchorKey: string,
  month: CalendarMonth,
): { week: RecordsPeriodState; month: RecordsPeriodState } {
  const weekRange = weekRanges(weekAnchorKey);
  const week = useQuery({
    ...periodStatsQuery(userId ?? 0, weekRange.range, weekRange.compareRange),
    enabled: userId != null,
  });

  const monthRange = monthRanges(month);
  const monthQuery = useQuery({
    ...periodStatsQuery(userId ?? 0, monthRange.range, monthRange.compareRange),
    enabled: userId != null,
  });

  return { week: toPeriodState(week), month: toPeriodState(monthQuery) };
}

function toPeriodState(query: {
  data: StudyPeriodStatsResponse | undefined;
  isError: boolean;
}): RecordsPeriodState {
  if (query.data !== undefined) {
    return {
      status: "success",
      daily: query.data.dailyList,
      compareDaily: query.data.compareDailyList,
    };
  }
  return query.isError ? { status: "error" } : { status: "pending" };
}
