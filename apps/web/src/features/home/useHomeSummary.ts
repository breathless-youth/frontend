import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { todayKstDateKey } from "@/lib/dateKst";
import { dailyStatsQuery, streakQuery } from "@/lib/statsQueries";

import { buildHomeSummary, type HomeSummary } from "./homeSummary";

export type HomeSummaryState =
  | { status: "pending" }
  | { status: "error"; retry: () => void }
  | { status: "success"; summary: HomeSummary };

/**
 * S1 홈 통계 조합 훅 (`apps/mobile/components/home/useHomeSummary.ts`에서 이식 — BY-329).
 * 오늘 통계·스트릭을 조회해 화면 모델로 만든다. 화면은 이 훅의 상태만 알고 데이터 배선은 모른다.
 *
 * 모바일판과의 차이:
 * - userId는 익명 등록 쿼리가 아니라 **셸이 준 URL 파라미터**를 인자로 받는다(등록은 네이티브 소유).
 * - 탭 재진입 갱신은 `useFocusEffect` 대신 react-query 기본값(`refetchOnWindowFocus`)이 맡는다 —
 *   웹뷰가 다시 보이면 stale 쿼리가 재조회된다.
 * - BY-316(미전송 로컬 세션 합산)이 이 훅에 얹힐 예정이라는 계획은 동일하다.
 */
export function useHomeSummary(userId: number): HomeSummaryState {
  const dateKey = todayKstDateKey();

  const stats = useQuery(dailyStatsQuery(userId, dateKey));
  const streak = useQuery(streakQuery(userId));

  const retry = useCallback(() => {
    if (stats.isError) {
      void stats.refetch();
    }
    if (streak.isError) {
      void streak.refetch();
    }
  }, [stats, streak]);

  if (stats.data !== undefined && streak.data !== undefined) {
    return { status: "success", summary: buildHomeSummary(stats.data, streak.data) };
  }
  if (stats.isError || streak.isError) {
    return { status: "error", retry };
  }
  return { status: "pending" };
}
