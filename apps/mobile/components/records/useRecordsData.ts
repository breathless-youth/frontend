import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

import type { StudySessionListResponse } from "@focuson/types";

import {
  type CalendarMonth,
  isDateKeyInMonth,
  statsQueryDateKey,
  weekDateKeys,
} from "../../lib/recordsFormat";
import {
  dailyStatsQuery,
  registeredUserIdQuery,
  statsKeys,
  streakQuery,
} from "../../lib/statsQueries";

export type RecordsDayState =
  | { status: "pending" }
  | { status: "error"; retry: () => void }
  | { status: "success"; stats: StudySessionListResponse };

export type StreakBannerState =
  | { status: "pending" }
  | { status: "hidden" }
  | { status: "success"; streakDays: number; doneDates: readonly string[] };

/**
 * S5 기록 조회 훅 — userId 확보(익명 등록) 후 선택일 통계와 보이는 달의 달력 도트를 조회한다.
 * 화면은 이 훅의 상태만 알고 데이터 배선은 모른다(홈 useHomeSummary와 같은 방침).
 *
 * 달 이동은 선택일에 영향을 주지 않는다(2026-07-28 확정 — "선택 없음" 상태는 없다). 보이는 달에
 * 선택일이 없으면 그 달 1일로 추가 조회해 `studiedDatesInMonth`만 쓴다 — 선택일 요약·리스트는
 * react-query 캐시로 계속 표시된다. 조회 실패 시에도 캐시가 있으면 success를 유지한다
 * (`day.data` 우선 분기가 그 역할이다).
 */
export function useRecordsData(
  selectedKey: string,
  month: CalendarMonth,
  todayKey: string,
): { day: RecordsDayState; studiedDates: readonly string[]; streakBanner: StreakBannerState } {
  const queryClient = useQueryClient();
  const user = useQuery(registeredUserIdQuery());
  const userId = user.data;

  // "선택일이 보이는 달에 속하는가"를 직접 판단한다 (리뷰 반영 — 반환값 문자열 비교로 간접
  // 추론하지 않는다). monthDateKey는 같은 규칙을 공유하므로 selectedInMonth일 때 selectedKey다.
  const selectedInMonth = isDateKeyInMonth(selectedKey, month);
  const monthDateKey = statsQueryDateKey(selectedKey, month);

  const day = useQuery({
    ...dailyStatsQuery(userId ?? 0, selectedKey),
    enabled: userId != null,
    // 날짜를 바꾸는 동안 직전 응답을 placeholder로 유지한다 — 도트(studiedDatesInMonth)가
    // 새 조회 동안 undefined로 비어 깜빡이는 것을 막는다. 요약·리스트는 아래 분기에서
    // placeholder를 pending으로 취급해, 새 날짜 제목 아래 이전 날짜 데이터가 보이지 않게 한다.
    placeholderData: keepPreviousData,
  });
  const monthStats = useQuery({
    ...dailyStatsQuery(userId ?? 0, monthDateKey),
    enabled: userId != null && !selectedInMonth,
  });
  const weekStart = weekDateKeys(todayKey)[0];
  const streak = useQuery({
    ...streakQuery(userId ?? 0, { from: weekStart, to: todayKey }),
    enabled: userId != null,
    // 자정 넘김으로 주 범위 키가 바뀌는 순간 직전 데이터를 유지해 배너가 스켈레톤으로 깜빡이지 않게 한다.
    placeholderData: keepPreviousData,
  });

  // 탭 재진입 시 통계를 신선하게 유지한다. invalidate는 stale 표시 + 활성 쿼리 재조회.
  useFocusEffect(
    useCallback(() => {
      if (userId != null) {
        void queryClient.invalidateQueries({ queryKey: statsKeys.all });
      }
    }, [queryClient, userId]),
  );

  // useCallback으로 감싸지 않는다(리뷰 반영) — retry는 렌더마다 새로 만들어지는 반환 객체(day)에
  // 실려 나가므로 참조를 안정화해도 소비자 입장에선 이득이 없다. 일반 함수가 의도를 정직하게 드러낸다.
  const retry = () => {
    if (user.isError) {
      void user.refetch();
      return;
    }
    if (day.isError) {
      void day.refetch();
    }
    if (monthStats.isError) {
      void monthStats.refetch();
    }
    if (streak.isError) {
      void streak.refetch();
    }
  };

  // 도트 조회 실패는 화면을 막지 않는다 — 빈 배열로 두면 도트만 안 찍힌다(포커스 재조회로 복구).
  const studiedDates =
    (selectedInMonth ? day.data?.studiedDatesInMonth : monthStats.data?.studiedDatesInMonth) ?? [];

  // 배너 상태(2026-07-28 확정): 캐시 있으면 success 유지, 실패(캐시 없음)면 숨김 —
  // 틀린 "0일째"를 보여주지 않는다. 오류 안내·재시도는 일별 기록 영역 ErrorState가 대표한다.
  const streakBanner: StreakBannerState =
    streak.data !== undefined
      ? {
          status: "success",
          streakDays: streak.data.streak,
          doneDates: streak.data.studiedDatesInRange,
        }
      : user.isError || streak.isError
        ? { status: "hidden" }
        : { status: "pending" };

  if (day.data !== undefined && !day.isPlaceholderData) {
    return { day: { status: "success", stats: day.data }, studiedDates, streakBanner };
  }
  if (user.isError || day.isError) {
    return { day: { status: "error", retry }, studiedDates, streakBanner };
  }
  return { day: { status: "pending" }, studiedDates, streakBanner };
}
