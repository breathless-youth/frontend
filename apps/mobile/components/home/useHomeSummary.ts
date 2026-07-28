import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

import { todayKstDateKey } from "../../lib/dateKst";
import { buildHomeSummary, type HomeSummary } from "../../lib/homeSummary";
import {
  dailyStatsQuery,
  registeredUserIdQuery,
  statsKeys,
  streakQuery,
} from "../../lib/statsQueries";

export type HomeSummaryState =
  | { status: "pending" }
  | { status: "error"; retry: () => void }
  | { status: "success"; summary: HomeSummary };

/**
 * S1 홈 통계 조합 훅 — userId 확보(익명 등록) 후 오늘 통계·스트릭을 조회해 화면 모델로
 * 만든다. 화면은 이 훅의 상태만 알고 데이터 배선은 모른다. BY-316이 이 훅에 미전송
 * 로컬 세션 합산을 얹을 예정이다.
 */
export function useHomeSummary(): HomeSummaryState {
  const queryClient = useQueryClient();
  const user = useQuery(registeredUserIdQuery());
  const userId = user.data;
  const dateKey = todayKstDateKey();

  const stats = useQuery({ ...dailyStatsQuery(userId ?? 0, dateKey), enabled: userId != null });
  const streak = useQuery({ ...streakQuery(userId ?? 0), enabled: userId != null });

  // 탭 재진입 시 오늘 통계를 신선하게 유지한다. invalidate는 stale 표시 + 활성 쿼리 재조회.
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
    if (stats.isError) {
      void stats.refetch();
    }
    if (streak.isError) {
      void streak.refetch();
    }
  }, [user, stats, streak]);

  if (stats.data !== undefined && streak.data !== undefined) {
    return { status: "success", summary: buildHomeSummary(stats.data, streak.data) };
  }
  if (user.isError || stats.isError || streak.isError) {
    return { status: "error", retry };
  }
  return { status: "pending" };
}
