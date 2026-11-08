import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type {
  DailyStudyStat,
  StudyPeriodStatsResponse,
  StudySessionListResponse,
  PersonalRecordListResponse,
} from "@focusmakers/types";
import { isSettledStatsDate, statsKeys } from "@/lib/statsQueries";
import { getPeriodStats, listStudySessionStats } from "@/lib/statsApi";
import { getPersonalRecordPeriod, getPersonalRecordStats } from "@/lib/personalRecordsApi";
import { personalRecordsKeys } from "@/lib/personalRecordsQueries";
import { usePlannerClock } from "@/features/planner/usePlannerClock";
import { hasTokenSource } from "@/lib/userId";

import type { CalendarMonth } from "./recordsFormat";
import { buildDayFocusMap, monthRanges } from "./recordsPeriod";

/** `period.data`가 없을 때 쓰는 안정된 빈 맵 — 매 렌더마다 새 참조를 만들지 않는다. */
const EMPTY_DAY_FOCUS: ReadonlyMap<string, number> = new Map();

export type RecordsDayState =
  | { status: "pending" }
  | { status: "error"; retry: () => void }
  | { status: "success"; stats: StudySessionListResponse | PersonalRecordListResponse };

export type RecordsPeriodState =
  | { status: "pending" }
  | { status: "error" }
  | { status: "success"; daily: DailyStudyStat[]; compareDaily: DailyStudyStat[] };

/**
 * `GET /api/stats/period` 쿼리를 화면용 tri-state로 파생하는 단일 정의처.
 * data가 있으면 success(일별·직전 기간), 아니면 error/pending. period는 placeholderData를 안 쓰므로
 * 기간을 넘기면 data가 undefined가 되어 자연히 pending으로 떨어진다. 주간(`useWeeklyData`)도 이걸 쓴다.
 */
export function derivePeriodState(query: {
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

/**
 * 기록 탭의 일간 목록과 월간 합계 조회
 *
 * 토큰이 있는 문서는 개인 수정본을 읽고 구 앱은 원본 읽기 전용 조회를 유지한다.
 * 과거의 개인 기록도 수정할 수 있어 원본의 무기한 캐시 정책은 적용하지 않는다.
 * 날짜 전환 중 이전 응답은 placeholder로 유지하되 새 날짜 아래 표시하지 않는다.
 */
export function useRecordsData(
  userId: number | null,
  selectedKey: string,
  month: CalendarMonth,
): { day: RecordsDayState; dayFocusSec: ReadonlyMap<string, number>; period: RecordsPeriodState } {
  const personal = hasTokenSource();
  const { timeZone } = usePlannerClock();
  const settledLegacyDate = !personal && isSettledStatsDate(selectedKey);
  const day = useQuery({
    queryKey: personal
      ? personalRecordsKeys.daily(userId ?? 0, selectedKey, timeZone)
      : statsKeys.daily(userId ?? 0, selectedKey),
    queryFn: ({ signal }): Promise<StudySessionListResponse | PersonalRecordListResponse> =>
      personal
        ? getPersonalRecordStats(selectedKey, { timeZone, signal })
        : listStudySessionStats(selectedKey),
    ...(settledLegacyDate ? { staleTime: Infinity, gcTime: 30 * 60 * 1000 } : {}),
    enabled: userId != null,
    // 날짜를 바꾸는 동안 직전 응답을 placeholder로 유지한다 — 선택일 요약·리스트가 새 조회
    // 동안 undefined로 비어 깜빡이는 것을 막는다. 아래 분기에서 placeholder를 pending으로
    // 취급해, 새 날짜 제목 아래 이전 날짜 데이터가 보이지 않게 한다.
    placeholderData: keepPreviousData,
  });

  const { range, compareRange } = monthRanges(month);
  const period = useQuery({
    queryKey: personal
      ? personalRecordsKeys.period(userId ?? 0, range, compareRange, timeZone)
      : statsKeys.period(userId ?? 0, range, compareRange),
    queryFn: ({ signal }) =>
      personal
        ? getPersonalRecordPeriod(range, compareRange, { timeZone, signal })
        : getPeriodStats(range, compareRange),
    enabled: userId != null,
  });

  const retry = () => {
    if (day.isError) {
      void day.refetch();
    }
    if (period.isError) {
      void period.refetch();
    }
  };

  // period는 placeholderData를 쓰지 않는다 — 달을 넘기면 새 쿼리가 끝날 때까지 data가 undefined라
  // pending으로 자연히 떨어지고, 이전 달 합계·농도가 새 달 제목 아래 남아있지 않는다.
  const dayFocusSec =
    period.data !== undefined ? buildDayFocusMap(period.data.dailyList) : EMPTY_DAY_FOCUS;
  const periodState = derivePeriodState(period);

  if (day.data !== undefined && !day.isPlaceholderData) {
    return { day: { status: "success", stats: day.data }, dayFocusSec, period: periodState };
  }
  if (day.isError) {
    return { day: { status: "error", retry }, dayFocusSec, period: periodState };
  }
  return { day: { status: "pending" }, dayFocusSec, period: periodState };
}
