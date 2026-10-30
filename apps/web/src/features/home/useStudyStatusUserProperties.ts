import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { weekDateKeys } from "@/features/records/recordsFormat";
import { setStudyStatusUserProperties } from "@/lib/amplitude";
import { todayKstDateKey } from "@/lib/dateKst";
import { dailyStatsQuery, streakQuery } from "@/lib/statsQueries";

/**
 * 푸시 타겟용 공부 상태 user property
 *
 * 홈에 들어올 때마다 오늘 통계와 이번 주 스트릭으로 보낸다.
 * 날짜는 홈 화면의 05시 기준이 아니라 기록 탭 달력과 같은 자정 기준이다.
 * 스트릭은 기록 탭 배너와 같은 키라 캐시를 나눠 쓴다.
 * 같은 값이 다시 와도 응답 시각이 바뀌므로 다시 보낸다.
 * 주가 바뀐 직후에는 새 주의 스트릭을 받을 때까지 보내지 않는다.
 */
export function useStudyStatusUserProperties(userId: number): void {
  const dateKey = todayKstDateKey();
  const stats = useQuery(dailyStatsQuery(userId, dateKey));
  const streak = useQuery(streakQuery(userId, { from: weekDateKeys(dateKey)[0], to: dateKey }));

  const statsData = stats.data;
  const streakData = streak.data;
  const statsUpdatedAt = stats.dataUpdatedAt;
  const streakUpdatedAt = streak.dataUpdatedAt;
  useEffect(() => {
    if (statsData === undefined || streakData === undefined) {
      return;
    }
    const todayStudyMin = Math.floor(statsData.totalStudySec / 60);
    setStudyStatusUserProperties({
      streakDays: streakData.streak,
      maxStreak: streakData.maxStreak,
      weekStudyDays: (streakData.studiedDatesInRange ?? []).length,
      todayStudyMin,
      studiedToday: todayStudyMin >= 1,
    });
  }, [statsData, streakData, statsUpdatedAt, streakUpdatedAt]);
}
