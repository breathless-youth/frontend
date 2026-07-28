import { queryOptions } from "@tanstack/react-query";

import { getStreak, listStudySessionStats } from "./statsApi";
import { ensureUserRegistered } from "./userApi";

/**
 * 서버 통계 queryOptions 모음 — queryKey·queryFn의 단일 정의처.
 * 세션 제출 성공 후에는 `statsKeys.all`로 일괄 invalidate 한다(BY-291).
 */
export const statsKeys = {
  all: ["stats"] as const,
  daily: (userId: number, date: string) => ["stats", "daily", userId, date] as const,
  streak: (userId: number) => ["stats", "streak", userId] as const,
};

export function dailyStatsQuery(userId: number, date: string) {
  return queryOptions({
    queryKey: statsKeys.daily(userId, date),
    queryFn: () => listStudySessionStats(userId, date),
  });
}

export function streakQuery(userId: number) {
  return queryOptions({
    queryKey: statsKeys.streak(userId),
    queryFn: () => getStreak(userId),
  });
}

/**
 * 익명 등록을 쿼리로 감싼다. `ensureUserRegistered`는 실패를 null로 삼키므로
 * 여기서 throw로 바꿔 react-query의 오류·재시도 경로에 태운다.
 * 성공한 userId는 세션 내내 불변이므로 staleTime을 무한으로 둔다.
 */
export function registeredUserIdQuery() {
  return queryOptions({
    queryKey: ["user", "registeredId"] as const,
    queryFn: async () => {
      const userId = await ensureUserRegistered();
      if (userId === null) {
        throw new Error("익명 유저 등록에 실패했습니다");
      }
      return userId;
    },
    staleTime: Infinity,
  });
}
