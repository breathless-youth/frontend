import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dailyStatsQuery, isSettledStatsDate, periodStatsQuery, statsKeys } from "../statsQueries";

describe("statsKeys.period", () => {
  it("비교 구간이 없으면 from/to까지만 키에 담는다", () => {
    expect(statsKeys.period(7, { from: "2026-08-24", to: "2026-08-30" })).toEqual([
      "stats",
      "period",
      7,
      "2026-08-24",
      "2026-08-30",
    ]);
  });

  it("비교 구간이 있으면 비교 날짜까지 키에 담는다", () => {
    expect(
      statsKeys.period(
        7,
        { from: "2026-08-24", to: "2026-08-30" },
        { from: "2026-08-17", to: "2026-08-23" },
      ),
    ).toEqual(["stats", "period", 7, "2026-08-24", "2026-08-30", "2026-08-17", "2026-08-23"]);
  });

  it("같은 구간이라도 비교 유무가 다르면 키가 갈린다", () => {
    const range = { from: "2026-08-24", to: "2026-08-30" };

    expect(statsKeys.period(7, range)).not.toEqual(
      statsKeys.period(7, range, { from: "2026-08-17", to: "2026-08-23" }),
    );
  });
});

describe("periodStatsQuery", () => {
  it("statsKeys.period와 같은 키를 쓴다", () => {
    const range = { from: "2026-08-24", to: "2026-08-30" };
    const compareRange = { from: "2026-08-17", to: "2026-08-23" };

    expect(periodStatsQuery(7, range, compareRange).queryKey).toEqual(
      statsKeys.period(7, range, compareRange),
    );
  });

  it("queryFn이 요청 URL에 비교 구간을 실어 보낸다", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((url: string) => {
      calls.push(url);
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }) as unknown as typeof fetch;

    try {
      const query = periodStatsQuery(
        7,
        { from: "2026-08-24", to: "2026-08-30" },
        { from: "2026-08-17", to: "2026-08-23" },
      );
      await (query.queryFn as () => Promise<unknown>)();
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(calls[0]).toBe(
      "/api/stats/period?userId=7&from=2026-08-24&to=2026-08-30&compareFrom=2026-08-17&compareTo=2026-08-23",
    );
  });
});

describe("isSettledStatsDate", () => {
  // KST 2026-09-15 새벽 3시. UTC로는 14일 18시라 KST 변환이 실제로 일어나는 시각이다.
  const now = new Date("2026-09-15T03:00:00+09:00");

  it("오늘과 어제는 거짓이다", () => {
    expect(isSettledStatsDate("2026-09-15", now)).toBe(false);
    expect(isSettledStatsDate("2026-09-14", now)).toBe(false);
  });

  it("이번 달의 과거 날짜는 거짓이다", () => {
    expect(isSettledStatsDate("2026-09-01", now)).toBe(false);
  });

  it("지난달 말일과 두 달 전은 참이다", () => {
    expect(isSettledStatsDate("2026-08-31", now)).toBe(true);
    expect(isSettledStatsDate("2026-07-10", now)).toBe(true);
  });

  it("매월 1일에는 어제와 그 전날이 모두 거짓이다", () => {
    const firstDay = new Date("2026-09-01T03:00:00+09:00");
    expect(isSettledStatsDate("2026-08-31", firstDay)).toBe(false);
    expect(isSettledStatsDate("2026-08-30", firstDay)).toBe(false);
  });

  it("매월 1일에는 지난달 전체가 거짓이다 (어제 기록이 지난달 도트를 바꾼다)", () => {
    const firstDay = new Date("2026-09-01T03:00:00+09:00");
    expect(isSettledStatsDate("2026-08-15", firstDay)).toBe(false);
    expect(isSettledStatsDate("2026-07-31", firstDay)).toBe(true);
  });
});

describe("dailyStatsQuery 캐시 옵션", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T03:00:00+09:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("정착된 날짜면 staleTime Infinity, gcTime 30분을 싣는다", () => {
    const query = dailyStatsQuery(7, "2026-07-10");
    expect(query.staleTime).toBe(Infinity);
    expect(query.gcTime).toBe(30 * 60 * 1000);
  });

  it("오늘·어제·이번 달 날짜는 두 옵션을 싣지 않는다", () => {
    for (const date of ["2026-09-15", "2026-09-14", "2026-09-01"]) {
      const query = dailyStatsQuery(7, date);
      expect(query.staleTime).toBeUndefined();
      expect(query.gcTime).toBeUndefined();
    }
  });
});
