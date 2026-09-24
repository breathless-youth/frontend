import { describe, expect, it } from "vitest";

import {
  MAX_CHART_HOURS,
  bestDay,
  buildDayFocusMap,
  buildWeekTrendRows,
  elapsedDaysInMonth,
  focusDeltaSec,
  mondayWeekDateKeys,
  monthRanges,
  studiedDayCount,
  studiedRatioPercent,
  sumFocusSec,
  toChartHours,
  weekRanges,
  weekTrendPoints,
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

describe("toChartHours — 12시간 clamp", () => {
  it("초를 시간으로 바꾼다", () => {
    expect(toChartHours(2 * 3600)).toBe(2);
    expect(toChartHours(90 * 60)).toBe(1.5);
    expect(toChartHours(0)).toBe(0);
  });

  it("12시간을 넘는 입력은 12로 자른다(고정 눈금이 아니라 값 자체를 clamp)", () => {
    expect(toChartHours(13 * 3600)).toBe(MAX_CHART_HOURS);
    expect(toChartHours(20 * 3600)).toBe(12);
    expect(toChartHours(12 * 3600 + 1)).toBe(12);
  });
});

describe("weekTrendPoints / buildWeekTrendRows — 이번 주 미래 날짜 제외", () => {
  // 2026-09-14(월)~20(일). 실제 API처럼 7일을 focusSec 포함 0으로 채운다.
  const fullWeek = [
    day("2026-09-14", 2 * 3600), // 월
    day("2026-09-15", 3600), // 화
    day("2026-09-16", 3 * 3600), // 수 = 오늘
    day("2026-09-17", 0), // 목 (미래, 서버가 0으로 채움)
    day("2026-09-18", 0), // 금 (미래)
    day("2026-09-19", 0), // 토 (미래)
    day("2026-09-20", 0), // 일 (미래)
  ];

  it("todayKey(수) 이후 요일은 thisWeek이 null이라 선에서 빠진다", () => {
    const points = weekTrendPoints(fullWeek, [], "2026-09-16");
    // 월·화·수는 값, 목~일은 null.
    expect(points.map((p) => p.thisWeekSec)).toEqual([
      2 * 3600,
      3600,
      3 * 3600,
      null,
      null,
      null,
      null,
    ]);
  });

  it("clamp된 차트 행에서도 미래 요일은 null이고 오늘까지만 값이 있다", () => {
    const rows = buildWeekTrendRows(fullWeek, [], "2026-09-16");
    expect(rows.map((r) => r.thisWeek)).toEqual([2, 1, 3, null, null, null, null]);
    // 끝점은 값이 있는 마지막 요일(수, index 2)이다.
    const lastPointIndex = rows.reduce((acc, r, i) => (r.thisWeek != null ? i : acc), -1);
    expect(lastPointIndex).toBe(2);
  });

  it("지난주(compareDaily)는 과거라 요일 값을 그대로 채운다", () => {
    const points = weekTrendPoints(
      [],
      [day("2026-09-07", 3600), day("2026-09-13", 2 * 3600)],
      "2026-09-16",
    );
    expect(points[0]?.lastWeekSec).toBe(3600); // 월
    expect(points[6]?.lastWeekSec).toBe(2 * 3600); // 일
  });

  it("요일 순서를 섞어 넣어도 월=0…일=6으로 정렬한다", () => {
    const rows = buildWeekTrendRows(
      [day("2026-09-16", 3 * 3600), day("2026-09-14", 2 * 3600)],
      [],
      "2026-09-20",
    );
    expect(rows.map((r) => r.day)).toEqual(["월", "화", "수", "목", "금", "토", "일"]);
    expect(rows[0]?.thisWeek).toBe(2); // 월
    expect(rows[2]?.thisWeek).toBe(3); // 수
  });
});

describe("elapsedDaysInMonth / studiedRatioPercent", () => {
  it("현재 달은 오늘 일자, 과거 달은 말일, 미래 달은 0이 경과일이다", () => {
    expect(elapsedDaysInMonth({ year: 2026, month: 9 }, "2026-09-20")).toBe(20);
    expect(elapsedDaysInMonth({ year: 2026, month: 9 }, "2026-10-05")).toBe(30);
    expect(elapsedDaysInMonth({ year: 2026, month: 11 }, "2026-09-20")).toBe(0);
  });

  it("비율은 반올림, 경과일 0이면 0%로 방어한다", () => {
    expect(studiedRatioPercent(3, 20)).toBe(15);
    expect(studiedRatioPercent(15, 30)).toBe(50);
    expect(studiedRatioPercent(0, 0)).toBe(0);
    expect(studiedRatioPercent(5, 0)).toBe(0);
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
