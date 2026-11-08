import { syncProfileTimeZone } from "@/features/profile/useTimeZoneSync";
import { queryOptions } from "@tanstack/react-query";
import { weekDateKeys } from "@/features/records/recordsFormat";
import { getStreak, listStudySessionStats } from "@/lib/statsApi";
import { statsKeys } from "@/lib/statsQueries";
import { assertCurrentUserId } from "@/lib/userId";

import type { HomeDay } from "./HomeV3Gateway";

async function waitForTimeZone(userId: number, day: HomeDay, signal: AbortSignal) {
  signal.throwIfAborted();
  assertCurrentUserId(userId);
  await syncProfileTimeZone(userId, day.timeZone);
  signal.throwIfAborted();
  assertCurrentUserId(userId);
}

/** 기존 통계 계약은 날짜만 받으므로, 프로필 시간대를 먼저 반영하고 새 시간대 캐시로 조회한다. */
export function homeV3StatsQuery(userId: number, day: HomeDay) {
  return queryOptions({
    queryKey: [...statsKeys.daily(userId, day.dateKey), day.timeZone] as const,
    queryFn: async ({ signal }) => {
      await waitForTimeZone(userId, day, signal);
      return listStudySessionStats(day.dateKey);
    },
  });
}

export function homeV3StreakQuery(userId: number, day: HomeDay) {
  const range = { from: weekDateKeys(day.dateKey)[0], to: day.dateKey };
  return queryOptions({
    queryKey: [...statsKeys.streak(userId, range), day.timeZone] as const,
    queryFn: async ({ signal }) => {
      await waitForTimeZone(userId, day, signal);
      return getStreak(range);
    },
  });
}
