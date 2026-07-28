import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

import type { StudySessionListResponse } from "@focuson/types";

import { type CalendarMonth, isDateKeyInMonth, statsQueryDateKey } from "../../lib/recordsFormat";
import { dailyStatsQuery, registeredUserIdQuery, statsKeys } from "../../lib/statsQueries";

export type RecordsDayState =
  | { status: "pending" }
  | { status: "error"; retry: () => void }
  | { status: "success"; stats: StudySessionListResponse };

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
): { day: RecordsDayState; studiedDates: readonly string[] } {
  const queryClient = useQueryClient();
  const user = useQuery(registeredUserIdQuery());
  const userId = user.data;

  // "선택일이 보이는 달에 속하는가"를 직접 판단한다 (리뷰 반영 — 반환값 문자열 비교로 간접
  // 추론하지 않는다). monthDateKey는 같은 규칙을 공유하므로 selectedInMonth일 때 selectedKey다.
  const selectedInMonth = isDateKeyInMonth(selectedKey, month);
  const monthDateKey = statsQueryDateKey(selectedKey, month);

  const day = useQuery({ ...dailyStatsQuery(userId ?? 0, selectedKey), enabled: userId != null });
  const monthStats = useQuery({
    ...dailyStatsQuery(userId ?? 0, monthDateKey),
    enabled: userId != null && !selectedInMonth,
  });

  // 탭 재진입 시 통계를 신선하게 유지한다. invalidate는 stale 표시 + 활성 쿼리 재조회.
  useFocusEffect(
    useCallback(() => {
      if (userId != null) {
        void queryClient.invalidateQueries({ queryKey: statsKeys.all });
      }
    }, [queryClient, userId]),
  );

  const retry = useCallback(() => {
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
  }, [user, day, monthStats]);

  // 도트 조회 실패는 화면을 막지 않는다 — 빈 배열로 두면 도트만 안 찍힌다(포커스 재조회로 복구).
  const studiedDates =
    (selectedInMonth ? day.data?.studiedDatesInMonth : monthStats.data?.studiedDatesInMonth) ?? [];

  if (day.data !== undefined) {
    return { day: { status: "success", stats: day.data }, studiedDates };
  }
  if (user.isError || day.isError) {
    return { day: { status: "error", retry }, studiedDates };
  }
  return { day: { status: "pending" }, studiedDates };
}
