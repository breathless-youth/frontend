import { useQuery } from "@tanstack/react-query";
import type { StudyRhythmResponse } from "@focusmakers/types";

import { statsKeys } from "@/lib/statsQueries";
import { getPeriodStats, getStudyRhythm } from "@/lib/statsApi";
import { getPersonalRecordPeriod, getPersonalRecordRhythm } from "@/lib/personalRecordsApi";
import { personalRecordsKeys } from "@/lib/personalRecordsQueries";
import { hasTokenSource } from "@/lib/userId";
import { usePlannerClock } from "@/features/planner/usePlannerClock";

import { weekRanges } from "./recordsPeriod";
import { derivePeriodState, type RecordsPeriodState } from "./useRecordsData";

export type RhythmState =
  { status: "pending" } | { status: "error" } | { status: "success"; data: StudyRhythmResponse };

/**
 * 기록 탭의 주간 합계와 전체 기간 공부 리듬 조회
 *
 * 토큰 문서는 개인 수정본을 사용하며 구 앱은 원본 조회를 유지한다.
 * 주를 변경하면 기간 데이터는 pending으로 전환하고 리듬은 같은 캐시를 재사용한다.
 */
export function useWeeklyData(
  userId: number | null,
  weekAnchorKey: string,
): { week: RecordsPeriodState; rhythm: RhythmState } {
  const weekRange = weekRanges(weekAnchorKey);
  const personal = hasTokenSource();
  const { timeZone } = usePlannerClock();
  const week = useQuery({
    queryKey: personal
      ? personalRecordsKeys.period(userId ?? 0, weekRange.range, weekRange.compareRange, timeZone)
      : statsKeys.period(userId ?? 0, weekRange.range, weekRange.compareRange),
    queryFn: ({ signal }) =>
      personal
        ? getPersonalRecordPeriod(weekRange.range, weekRange.compareRange, { timeZone, signal })
        : getPeriodStats(weekRange.range, weekRange.compareRange),
    enabled: userId != null,
  });
  const rhythm = useQuery({
    queryKey: personal
      ? personalRecordsKeys.rhythm(userId ?? 0, timeZone)
      : statsKeys.studyRhythm(userId ?? 0),
    queryFn: ({ signal }) =>
      personal ? getPersonalRecordRhythm({ timeZone, signal }) : getStudyRhythm(),
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
