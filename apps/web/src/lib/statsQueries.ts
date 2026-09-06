import { queryOptions } from "@tanstack/react-query";

import type { DateRange } from "./statsApi";
import { getPeriodStats, getStreak, listStudySessionStats } from "./statsApi";
import { todayKstDateKey } from "./dateKst";

/**
 * 통계 queryOptions 모음
 *
 * 기본 staleTime(30초)과 그 근거는 lib/queryClient.ts에 있다.
 * 세션 종료 후 홈 갱신은 브라우저 단독 모드에서는 useStudyRoomSession의 제출 성공 무효화가,
 * 네이티브 웹뷰에서는 세션이 별도 document라 홈 탭의 refetchOnWindowFocus가 맡는다.
 * 앱 실행 직후의 미확정 세션 마감도 홈을 벗어나지 않고 갱신해야 해서 직접 무효화한다.
 *
 * 홈은 streakQuery(userId), 기록은 streakQuery(userId, range)로 키가 갈린다.
 * streak와 maxStreak는 범위와 무관해 값이 어긋나지는 않고,
 * 브라우저 단독 모드에서 탭을 오갈 때 조회가 한 번 더 나가는 비용만 있어 합치지 않는다.
 */
export const statsKeys = {
  all: ["stats"] as const,
  daily: (userId: number, date: string) => ["stats", "daily", userId, date] as const,
  streak: (userId: number, range?: DateRange) =>
    range
      ? (["stats", "streak", userId, range.from, range.to] as const)
      : (["stats", "streak", userId] as const),
  // 비교 구간이 키를 가른다 — 같은 from~to라도 비교를 낀 응답은 compareDailyList가 달라서,
  // 키를 합치면 비교 없는 화면이 비교 데이터를 물고 온다.
  period: (userId: number, range: DateRange, compareRange?: DateRange) =>
    compareRange
      ? ([
          "stats",
          "period",
          userId,
          range.from,
          range.to,
          compareRange.from,
          compareRange.to,
        ] as const)
      : (["stats", "period", userId, range.from, range.to] as const),
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** 정착된 날짜는 달력을 넘나드는 동안 캐시가 살아 있어야 한다. */
const SETTLED_GC_TIME_MS = 30 * 60 * 1000;

/**
 * 더는 바뀌지 않는 날짜인가. 어제보다 오래됐고 이번 달도 어제의 달도 아니어야 한다.
 *
 * 어제까지 제외하는 이유: 자정을 넘긴 세션은 서버가 자정에서 둘로 나눠 어제 기록이 오늘
 * 새벽에 생기고, 강제 종료로 남은 세션은 서버가 나중에 확정한다.
 * 이번 달을 통째로 제외하는 이유: 일별 응답의 studiedDatesInMonth가 오늘 세션으로 바뀌는데
 * 기록 화면은 선택한 날짜의 응답에서 도트를 꺼내 찍는다.
 * 매월 1일에는 어제가 지난달이라 어제의 달도 통째로 제외한다. 새로 생긴 어제 기록이 그
 * 달의 도트 목록을 바꾸고, 그 목록은 그 달 모든 날짜의 응답에 실려 오기 때문이다.
 */
export function isSettledStatsDate(date: string, now: Date = new Date()): boolean {
  const todayKey = todayKstDateKey(now);
  const yesterdayKey = todayKstDateKey(new Date(now.getTime() - DAY_MS));
  const month = date.slice(0, 7);
  return (
    date < yesterdayKey && month !== todayKey.slice(0, 7) && month !== yesterdayKey.slice(0, 7)
  );
}

export function dailyStatsQuery(userId: number, date: string) {
  return queryOptions({
    queryKey: statsKeys.daily(userId, date),
    queryFn: () => listStudySessionStats(userId, date),
    ...(isSettledStatsDate(date) ? { staleTime: Infinity, gcTime: SETTLED_GC_TIME_MS } : {}),
  });
}

export function streakQuery(userId: number, range?: DateRange) {
  return queryOptions({
    queryKey: statsKeys.streak(userId, range),
    queryFn: () => getStreak(userId, range),
  });
}

export function periodStatsQuery(userId: number, range: DateRange, compareRange?: DateRange) {
  return queryOptions({
    queryKey: statsKeys.period(userId, range, compareRange),
    queryFn: () => getPeriodStats(userId, range, compareRange),
  });
}
