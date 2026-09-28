import type { StudySessionListResponse, StudySessionStreakResponse } from "@focusmakers/types";

import { buildStreakWeek, type StreakWeekDay } from "@/features/records/recordsFormat";

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
  /** 이번 주(일~토) 도트 7개. 오늘·공부한 날·나머지로 갈린다. */
  weekDays: StreakWeekDay[];
}

export function buildHomeSummary(
  stats: StudySessionListResponse,
  streak: StudySessionStreakResponse,
  todayKey: string,
): HomeSummary {
  return {
    focusSec: stats.totalFocusSec,
    studySec: stats.totalStudySec,
    focusRate: stats.focusRate,
    streakDays: streak.streak,
    longestFocusSec: stats.longestFocusSec,
    // 계약상 필수 필드지만 서버 계약 드리프트 시 오류 없이 도트만 전부 비는 무증상 실패가 되므로
    // 방어한다(기록 탭 useRecordsData와 같은 방침).
    weekDays: buildStreakWeek(todayKey, streak.studiedDatesInRange ?? []),
  };
}
