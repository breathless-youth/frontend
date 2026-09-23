import { describe, expect, it } from "vitest";

import {
  bestDay,
  buildDayFocusMap,
  focusDeltaSec,
  mondayWeekDateKeys,
  monthRanges,
  studiedDayCount,
  sumFocusSec,
  weekRanges,
} from "../recordsPeriod";

const day = (date: string, focusSec: number) => ({ date, studySec: focusSec + 100, focusSec });

describe("recordsPeriod — 주간·월간 범위와 헤더 숫자", () => {
  it("주는 월요일에 시작한다 — 일요일을 고르면 그 주의 월요일까지 거슬러 간다", () => {
    expect(mondayWeekDateKeys("2026-09-27")[0]).toBe("2026-09-21"); // 일요일
    expect(mondayWeekDateKeys("2026-09-21")[0]).toBe("2026-09-21"); // 월요일
    expect(mondayWeekDateKeys("2026-09-24")).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
  });

  it("weekRanges — 그 주와 직전 주", () => {
    expect(weekRanges("2026-09-24")).toEqual({
      range: { from: "2026-09-21", to: "2026-09-27" },
      compareRange: { from: "2026-09-14", to: "2026-09-20" },
    });
  });

  it("monthRanges — 말일과 연도 넘김을 맞춘다", () => {
    expect(monthRanges({ year: 2026, month: 3 })).toEqual({
      range: { from: "2026-03-01", to: "2026-03-31" },
      compareRange: { from: "2026-02-01", to: "2026-02-28" },
    });
    expect(monthRanges({ year: 2026, month: 1 }).compareRange).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(monthRanges({ year: 2028, month: 3 }).compareRange.to).toBe("2028-02-29");
  });

  it("합계·증감·최고·공부일", () => {
    const daily = [day("2026-09-21", 3600), day("2026-09-22", 0), day("2026-09-23", 7200)];
    const compare = [day("2026-09-14", 4000), day("2026-09-15", 4000)];
    expect(sumFocusSec(daily)).toBe(10800);
    expect(focusDeltaSec(daily, compare)).toBe(2800);
    expect(bestDay(daily)).toEqual(day("2026-09-23", 7200));
    expect(bestDay([day("2026-09-22", 0)])).toBeNull();
    expect(studiedDayCount(daily)).toBe(2);
  });
});

describe("buildDayFocusMap", () => {
  it("날짜별 순공시간을 맵으로 만든다", () => {
    const map = buildDayFocusMap([
      { date: "2026-09-01", studySec: 100, focusSec: 90 },
      { date: "2026-09-02", studySec: 0, focusSec: 0 },
    ]);
    expect(map.get("2026-09-01")).toBe(90);
    expect(map.get("2026-09-02")).toBe(0);
    expect(map.has("2026-09-03")).toBe(false);
  });
});
