import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { DailyStudyStat, StudySessionListResponse } from "@focusmakers/types";
import { dailyStatsQuery, periodStatsQuery } from "@/lib/statsQueries";

import type { CalendarMonth } from "./recordsFormat";
import { buildDayFocusMap, monthRanges } from "./recordsPeriod";

export type RecordsDayState =
  | { status: "pending" }
  | { status: "error"; retry: () => void }
  | { status: "success"; stats: StudySessionListResponse };

export type RecordsPeriodState =
  | { status: "pending" }
  | { status: "error" }
  | { status: "success"; daily: DailyStudyStat[]; compareDaily: DailyStudyStat[] };

/**
 * 기록 조회 훅
 *
 * 선택일 통계와 보이는 달의 기간 집계(달력 농도·월 요약용)를 조회한다. 화면은 이 훅의 상태만
 * 알고 데이터 배선은 모른다(홈 useHomeSummary와 같은 방침).
 *
 * 모바일판과의 차이:
 * - userId는 익명 등록 쿼리(`registeredUserIdQuery`)가 아니라 **셸이 준 URL 파라미터**를
 *   인자로 받는다(등록은 네이티브 소유) — 화면 진입 시 아직 없을 수 있어 `number | null`이다.
 * - 탭 재진입 갱신은 `useFocusEffect` 대신 react-query 기본값(`refetchOnWindowFocus`)이 맡는다 —
 *   웹뷰가 다시 보이면 stale 쿼리가 재조회된다.
 *
 * 달 이동은 선택일에 영향을 주지 않는다(2026-07-28 확정 — "선택 없음" 상태는 없다). 보이는 달의
 * 달력 농도·월 요약은 BY-567부터 스트릭·일별 도트 대신 `GET /api/stats/period` 하나로 채운다
 * (`recordsPeriod.monthRanges`가 그 달과 직전 달 범위를 만든다). 선택일 요약·리스트는 여전히
 * `dailyStatsQuery`가 맡고, 조회 실패 시에도 캐시가 있으면 success를 유지한다
 * (`day.data` 우선 분기가 그 역할이다).
 */
export function useRecordsData(
  userId: number | null,
  selectedKey: string,
  month: CalendarMonth,
): { day: RecordsDayState; dayFocusSec: ReadonlyMap<string, number>; period: RecordsPeriodState } {
  const day = useQuery({
    ...dailyStatsQuery(userId ?? 0, selectedKey),
    enabled: userId != null,
    // 날짜를 바꾸는 동안 직전 응답을 placeholder로 유지한다 — 선택일 요약·리스트가 새 조회
    // 동안 undefined로 비어 깜빡이는 것을 막는다. 아래 분기에서 placeholder를 pending으로
    // 취급해, 새 날짜 제목 아래 이전 날짜 데이터가 보이지 않게 한다.
    placeholderData: keepPreviousData,
  });

  const { range, compareRange } = monthRanges(month);
  const period = useQuery({
    ...periodStatsQuery(userId ?? 0, range, compareRange),
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
  const periodReady = period.data !== undefined;
  const dayFocusSec = periodReady
    ? buildDayFocusMap(period.data.dailyList)
    : new Map<string, number>();
  const periodState: RecordsPeriodState = periodReady
    ? {
        status: "success",
        daily: period.data.dailyList,
        compareDaily: period.data.compareDailyList,
      }
    : period.isError
      ? { status: "error" }
      : { status: "pending" };

  if (day.data !== undefined && !day.isPlaceholderData) {
    return { day: { status: "success", stats: day.data }, dayFocusSec, period: periodState };
  }
  if (day.isError) {
    return { day: { status: "error", retry }, dayFocusSec, period: periodState };
  }
  return { day: { status: "pending" }, dayFocusSec, period: periodState };
}
