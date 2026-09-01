import { describe, expect, it } from "vitest";

import { periodStatsQuery, statsKeys } from "../statsQueries";

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
