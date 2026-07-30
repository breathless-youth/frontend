import type { StudySessionListResponse, StudySessionStreakResponse } from "@focuson/types";

/**
 * S1 홈 통계 영역의 화면 모델 (`apps/mobile/lib/homeSummary.ts`에서 이식 — BY-329).
 * 집중률·스트릭은 서버 계산 값을 그대로 쓴다(로컬 보정 금지).
 */
export interface HomeSummary {
  focusSec: number;
  studySec: number;
  focusRate: number;
  streakDays: number;
  longestFocusSec: number;
}

export function buildHomeSummary(
  stats: StudySessionListResponse,
  streak: StudySessionStreakResponse,
): HomeSummary {
  return {
    focusSec: stats.totalFocusSec,
    studySec: stats.totalStudySec,
    focusRate: stats.focusRate,
    streakDays: streak.streak,
    longestFocusSec: stats.longestFocusSec,
  };
}
