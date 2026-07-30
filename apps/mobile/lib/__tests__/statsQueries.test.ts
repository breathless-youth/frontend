import { dailyStatsQuery, registeredUserIdQuery, statsKeys, streakQuery } from "../statsQueries";

import { getStreak, listStudySessionStats } from "../statsApi";
import { ensureUserRegistered } from "../userApi";

/**
 * `listStudySessionStats`의 기본 응답은 **계약 모양을 지켜야 한다** — `dailyStatsQuery`가
 * 이제 `toDisplayedStats`로 세션을 걸러내므로 `sessions`가 없으면 거기서 터진다.
 * (일부러 방어 코드를 넣지 않았다: 응답에 `sessions`가 없는 것은 계약 위반이고, 삼키면
 * 원인을 못 찾는다.)
 */
jest.mock("../statsApi", () => ({
  listStudySessionStats: jest.fn().mockResolvedValue({
    sessions: [],
    sessionCount: 0,
    totalStudySec: 1,
    totalFocusSec: 0,
    longestFocusSec: 0,
    focusRate: 0,
    totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, PAUSE: 0 },
    studiedDatesInMonth: [],
  }),
  getStreak: jest.fn().mockResolvedValue({ streak: 2, maxStreak: 3 }),
}));
jest.mock("../userApi", () => ({
  ensureUserRegistered: jest.fn(),
}));

const mockedEnsure = ensureUserRegistered as jest.MockedFunction<typeof ensureUserRegistered>;

describe("statsKeys", () => {
  it("일일·스트릭 키는 stats 루트 키를 공유한다 (일괄 invalidate 대상)", () => {
    expect(dailyStatsQuery(7, "2026-07-28").queryKey[0]).toBe(statsKeys.all[0]);
    expect(streakQuery(7).queryKey[0]).toBe(statsKeys.all[0]);
  });

  it("userId·날짜가 다르면 키도 다르다", () => {
    expect(dailyStatsQuery(7, "2026-07-28").queryKey).not.toEqual(
      dailyStatsQuery(7, "2026-07-27").queryKey,
    );
    expect(streakQuery(7).queryKey).not.toEqual(streakQuery(8).queryKey);
  });
});

describe("queryFn 위임", () => {
  it("dailyStatsQuery는 statsApi.listStudySessionStats를 호출한다", async () => {
    await dailyStatsQuery(7, "2026-07-28").queryFn!({} as never);
    expect(listStudySessionStats).toHaveBeenCalledWith(7, "2026-07-28");
  });

  it("streakQuery는 statsApi.getStreak을 호출한다", async () => {
    await streakQuery(7).queryFn!({} as never);
    expect(getStreak).toHaveBeenCalledWith(7);
  });
});

/**
 * 필터를 **이 한 곳에서만** 적용하는 것이 계약이다. 홈(`useHomeSummary`)과 기록
 * (`useRecordsData`)이 같은 queryKey를 공유하므로 여기를 지나면 두 화면이 같은 값을 본다 —
 * 화면마다 따로 걸러내면 한쪽만 빠뜨렸을 때 순공시간이 조용히 달라진다.
 */
describe("dailyStatsQuery — 1분 미만 세션 필터", () => {
  const mockedList = listStudySessionStats as jest.MockedFunction<typeof listStudySessionStats>;

  function summary(id: number, focusSec: number, studySec: number) {
    return {
      id,
      statDate: "2026-07-28",
      startedAt: "2026-07-28T01:00:00.000Z",
      endedAt: "2026-07-28T02:00:00.000Z",
      studySec,
      focusSec,
      focusRate: 0,
      eventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, PAUSE: 0 },
    };
  }

  it("캐시에 들어가기 전에 순공 1분 미만 세션과 그 합산을 걷어낸다", async () => {
    mockedList.mockResolvedValue({
      sessions: [summary(1, 3000, 3600), summary(2, 30, 120)],
      sessionCount: 2,
      totalStudySec: 3720,
      totalFocusSec: 3030,
      longestFocusSec: 3000,
      focusRate: 81.5,
      totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, PAUSE: 0 },
      studiedDatesInMonth: ["2026-07-28"],
    });

    const stats = await dailyStatsQuery(7, "2026-07-28").queryFn!({} as never);

    expect(stats.sessions.map((each) => each.id)).toEqual([1]);
    expect(stats.sessionCount).toBe(1);
    expect(stats.totalFocusSec).toBe(3000);
    expect(stats.totalStudySec).toBe(3600);
  });
});

describe("registeredUserIdQuery", () => {
  it("등록 성공 시 userId를 반환한다", async () => {
    mockedEnsure.mockResolvedValue(42);
    await expect(registeredUserIdQuery().queryFn!({} as never)).resolves.toBe(42);
  });

  it("등록 실패(null) 시 throw 한다 — 오류 UI·재시도 경로로 흐르게", async () => {
    mockedEnsure.mockResolvedValue(null);
    await expect(registeredUserIdQuery().queryFn!({} as never)).rejects.toThrow();
  });
});
