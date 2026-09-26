import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { weekDateKeys } from "@/features/records/recordsFormat";
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
 * - userId는 익명 등록 쿼리가 아니라 네이티브가 `auth-token`으로 넘긴 신원(`useUserId`)을 받는다(등록은 네이티브 소유).
 *   구 앱 웹뷰처럼 토큰 출처가 없으면 `useUserId`가 URL의 `userId`로 폴백한다.
 * - 탭 재진입 갱신은 `useFocusEffect` 대신 react-query 기본값(`refetchOnWindowFocus`)이 맡는다 —
 *   웹뷰가 다시 보이면 stale 쿼리가 재조회된다.
 * - BY-316(미전송 로컬 세션 합산)이 이 훅에 얹힐 예정이라는 계획은 동일하다.
 */
export function useHomeSummary(userId: number): HomeSummaryState {
  const dateKey = todayKstDateKey();

  // 자정을 넘기면 날짜 키가 바뀐다. 오늘 통계에는 직전 응답을 placeholder로 두지 않는다. 어제
  // 합계가 새 날짜 아래 "오늘 순공시간"으로 보이면 안 되므로 새 응답까지 스켈레톤이 맞다.
  const stats = useQuery(dailyStatsQuery(userId, dateKey));
  // 주간 도트 때문에 이번 주 범위로 조회한다. 기록 탭 배너와 같은 키라 캐시를 나눠 쓰고, 주 범위가
  // 바뀌는 순간에는 직전 도트를 유지한다(기록 탭과 같은 처리).
  const streak = useQuery({
    ...streakQuery(userId, { from: weekDateKeys(dateKey)[0], to: dateKey }),
    placeholderData: keepPreviousData,
  });

  const retry = useCallback(() => {
    if (stats.isError) {
      void stats.refetch();
    }
    if (streak.isError) {
      void streak.refetch();
    }
  }, [stats, streak]);

  if (stats.data !== undefined && streak.data !== undefined) {
    return { status: "success", summary: buildHomeSummary(stats.data, streak.data, dateKey) };
  }
  if (stats.isError || streak.isError) {
    return { status: "error", retry };
  }
  return { status: "pending" };
}
