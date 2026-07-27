import type { StudySessionListResponse, StudySessionStreakResponse } from "@focuson/types";

import { buildHomeSummary } from "../homeSummary";

const stats: StudySessionListResponse = {
  sessions: [],
  sessionCount: 2,
  totalStudySec: 5 * 3600,
  totalFocusSec: 3 * 3600,
  longestFocusSec: 52 * 60,
  focusRate: 71.3,
  totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, PAUSE: 0 },
  studiedDatesInMonth: [],
};

const streak: StudySessionStreakResponse = { streak: 12, maxStreak: 20 };

describe("buildHomeSummary", () => {
  it("서버 응답을 화면 모델로 매핑한다 (집중률은 서버 값 그대로)", () => {
    expect(buildHomeSummary(stats, streak)).toEqual({
      focusSec: 3 * 3600,
      studySec: 5 * 3600,
      focusRate: 71.3,
      streakDays: 12,
      longestFocusSec: 52 * 60,
    });
  });

  it("기록 없는 날은 전부 0이다", () => {
    const empty: StudySessionListResponse = {
      ...stats,
      sessionCount: 0,
      totalStudySec: 0,
      totalFocusSec: 0,
      longestFocusSec: 0,
      focusRate: 0,
    };
    expect(buildHomeSummary(empty, { streak: 0, maxStreak: 0 })).toEqual({
      focusSec: 0,
      studySec: 0,
      focusRate: 0,
      streakDays: 0,
      longestFocusSec: 0,
    });
  });
});
