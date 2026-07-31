import { queryOptions } from "@tanstack/react-query";

import type { StreakRange } from "./statsApi";
import { getStreak, listStudySessionStats } from "./statsApi";

/**
 * 서버 통계 queryOptions 모음 — queryKey·queryFn의 단일 정의처
 * (`apps/mobile/lib/statsQueries.ts`에서 이식 — BY-329).
 * 세션 제출 성공 후에는 `statsKeys.all`로 일괄 invalidate 한다.
 *
 * 모바일판의 `registeredUserIdQuery`(익명 등록)는 이식하지 않는다 — 새 아키텍처에서 유저
 * 등록은 네이티브 셸 소유이고, 웹은 `?userId=N`으로 받는다(`routes/HomeTabPage.tsx` 계약).
 */
export const statsKeys = {
  all: ["stats"] as const,
  daily: (userId: number, date: string) => ["stats", "daily", userId, date] as const,
  streak: (userId: number, range?: StreakRange) =>
    range
      ? (["stats", "streak", userId, range.from, range.to] as const)
      : (["stats", "streak", userId] as const),
};

export function dailyStatsQuery(userId: number, date: string) {
  return queryOptions({
    queryKey: statsKeys.daily(userId, date),
    queryFn: () => listStudySessionStats(userId, date),
  });
}

export function streakQuery(userId: number, range?: StreakRange) {
  return queryOptions({
    queryKey: statsKeys.streak(userId, range),
    queryFn: () => getStreak(userId, range),
  });
}
