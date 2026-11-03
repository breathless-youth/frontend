import { useQuery } from "@tanstack/react-query";
import type { StudyRhythmResponse } from "@focusmakers/types";

import { periodStatsQuery, studyRhythmQuery } from "@/lib/statsQueries";

import { weekRanges } from "./recordsPeriod";
import { derivePeriodState, type RecordsPeriodState } from "./useRecordsData";

export type RhythmState =
  { status: "pending" } | { status: "error" } | { status: "success"; data: StudyRhythmResponse };

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
 * 리듬은 주를 따라가지 않는 전체 기간 값이라 `GET /api/stats/rhythm`을 한 번만 조회한다(주를 넘겨도 그대로).
 */
export function useWeeklyData(
  userId: number | null,
  weekAnchorKey: string,
): { week: RecordsPeriodState; rhythm: RhythmState } {
  const weekRange = weekRanges(weekAnchorKey);
  const week = useQuery({
    ...periodStatsQuery(userId ?? 0, weekRange.range, weekRange.compareRange),
    enabled: userId != null,
  });
  const rhythm = useQuery({
    ...studyRhythmQuery(userId ?? 0),
    enabled: userId != null,
  });

  return {
    week: derivePeriodState(week),
    rhythm:
      rhythm.data !== undefined
        ? { status: "success", data: rhythm.data }
        : rhythm.isError
          ? { status: "error" }
          : { status: "pending" },
  };
}
