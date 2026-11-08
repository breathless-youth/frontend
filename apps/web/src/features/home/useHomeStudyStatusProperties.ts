import type { StudySessionListResponse, StudySessionStreakResponse } from "@focusmakers/types";
import { useEffect } from "react";

import { setStudyStatusUserProperties } from "@/lib/amplitude";

/** 홈의 두 레이아웃이 같은 공부 상태 사용자 속성을 유지한다. 조회 실패를 0으로 보내지 않는다. */
export function useHomeStudyStatusProperties(
  statsData: StudySessionListResponse | undefined,
  streakData: StudySessionStreakResponse | undefined,
  statsUpdatedAt: number,
  streakUpdatedAt: number,
) {
  useEffect(() => {
    if (statsData === undefined || streakData === undefined) return;
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
