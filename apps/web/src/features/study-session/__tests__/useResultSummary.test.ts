import { describe, expect, it, vi } from "vitest";

import { getPeriodStats } from "@/lib/statsApi";

import { countStudyDays, splitDateRange } from "../useResultSummary";

vi.mock("@/lib/statsApi", () => ({ getPeriodStats: vi.fn() }));
const mockedPeriod = vi.mocked(getPeriodStats);

/** 기간 집계 API는 366일 상한이라 창을 나눠야 한다 — 경계(양끝 포함)를 못 박는다. */
describe("splitDateRange", () => {
  it("상한 안이면 창 하나다", () => {
    expect(splitDateRange("2026-01-01", "2026-09-14", 366)).toEqual([
      { from: "2026-01-01", to: "2026-09-14" },
    ]);
  });

  it("상한을 넘기면 366일(양끝 포함) 창으로 잘라 이어 붙인다", () => {
    expect(splitDateRange("2026-01-01", "2027-03-01", 366)).toEqual([
      { from: "2026-01-01", to: "2027-01-01" },
      { from: "2027-01-02", to: "2027-03-01" },
    ]);
  });

  it("시작이 끝보다 뒤면 빈 배열이다", () => {
    expect(splitDateRange("2026-09-15", "2026-09-14", 366)).toEqual([]);
  });
});

describe("countStudyDays", () => {
  it("모든 창의 일별 집계에서 기록이 있는 날(studySec > 0)만 센다", async () => {
    mockedPeriod
      .mockResolvedValueOnce({
        from: "2026-01-01",
        to: "2027-01-01",
        compareFrom: null,
        compareTo: null,
        dailyList: [
          { date: "2026-08-01", studySec: 600, focusSec: 500 },
          { date: "2026-08-02", studySec: 0, focusSec: 0 },
          { date: "2026-08-03", studySec: 30, focusSec: 30 },
        ],
        compareDailyList: [],
      })
      .mockResolvedValueOnce({
        from: "2027-01-02",
        to: "2027-03-01",
        compareFrom: null,
        compareTo: null,
        dailyList: [{ date: "2027-02-01", studySec: 1200, focusSec: 1000 }],
        compareDailyList: [],
      });

    await expect(countStudyDays(7, "2026-01-01", "2027-03-01")).resolves.toBe(3);
    expect(mockedPeriod).toHaveBeenCalledTimes(2);
    expect(mockedPeriod).toHaveBeenNthCalledWith(1, 7, { from: "2026-01-01", to: "2027-01-01" });
    expect(mockedPeriod).toHaveBeenNthCalledWith(2, 7, { from: "2027-01-02", to: "2027-03-01" });
  });
});
