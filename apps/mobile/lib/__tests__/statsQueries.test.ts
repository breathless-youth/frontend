import { dailyStatsQuery, registeredUserIdQuery, statsKeys, streakQuery } from "../statsQueries";

import { getStreak, listStudySessionStats } from "../statsApi";
import { ensureUserRegistered } from "../userApi";

jest.mock("../statsApi", () => ({
  listStudySessionStats: jest.fn().mockResolvedValue({ totalStudySec: 1 }),
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
