import { queryOptions } from "@tanstack/react-query";

import type { DateRange } from "./statsApi";
import { getStreak, listStudySessionStats } from "./statsApi";

/**
 * 서버 통계 queryOptions 모음 — queryKey·queryFn의 단일 정의처
 * (`apps/mobile/lib/statsQueries.ts`에서 이식 — BY-329).
 *
 * **웹에는 invalidate 호출이 없다**(모바일판 주석의 "제출 후 `statsKeys.all` 일괄 invalidate"를
 * 그대로 옮기지 않는다). 세션 종료는 S4를 거쳐 `/home`으로 **라우트 이동**하므로 탭 화면이 새로
 * 마운트되고, `QueryClient` 기본값(staleTime 0)에서 마운트 시 재조회가 일어난다 —
 * 같은 효과를 이동이 대신 낸다. 화면을 벗어나지 않고 갱신해야 하는 경우가 생기면 그때 넣는다.
 *
 * 모바일판의 `registeredUserIdQuery`(익명 등록)는 이식하지 않는다 — 새 아키텍처에서 유저
 * 등록은 네이티브 셸 소유이고, 웹은 `?userId=N`으로 받는다(`routes/HomeTabPage.tsx` 계약).
 *
 * 참고: 홈은 `streakQuery(userId)`, 기록은 `streakQuery(userId, range)`로 **키가 갈린다**.
 * `streak`·`maxStreak`는 범위와 무관하므로 값이 어긋나지는 않고, 탭 전환 시 조회가 한 번 더
 * 나가는 비용만 있다(BY-327 통합 검토에서 확인·수용).
 */
export const statsKeys = {
  all: ["stats"] as const,
  daily: (userId: number, date: string) => ["stats", "daily", userId, date] as const,
  streak: (userId: number, range?: DateRange) =>
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

export function streakQuery(userId: number, range?: DateRange) {
  return queryOptions({
    queryKey: statsKeys.streak(userId, range),
    queryFn: () => getStreak(userId, range),
  });
}
