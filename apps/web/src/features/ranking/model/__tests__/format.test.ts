import { describe, expect, it } from "vitest";

import {
  formatClock,
  formatDeadline,
  formatGap,
  formatGapDuration,
  formatMonthDay,
  formatRank,
  formatValue,
  progressPercent,
  recordMonthKey,
  recordName,
  recordPeriod,
  recordPeriodShort,
  recordValue,
  serverNowMs,
  weekOfMonthLabel,
} from "../format";

describe("순위와 값", () => {
  it("순위는 세 자리마다 쉼표", () => {
    expect(formatRank(1205)).toBe("1,205");
    expect(formatRank(12345)).toBe("12,345");
    expect(formatRank(3)).toBe("3");
  });

  it("시간 판 값은 H:MM:SS이고 시는 자르지 않는다", () => {
    expect(formatClock(47460)).toBe("13:11:00");
    expect(formatClock(148800)).toBe("41:20:00");
    expect(formatClock(11060.9)).toBe("3:04:20");
    expect(formatClock(-5)).toBe("0:00:00");
  });

  it("종목마다 단위가 다르다", () => {
    expect(formatValue("FOCUS_TIME", 45600)).toBe("12:40:00");
    expect(formatValue("TOTAL_TIME", 1483200)).toBe("412시간");
    expect(formatValue("TOTAL_TIME", 15804000)).toBe("4,390시간");
    expect(formatValue("FOCUS_RATE", 96)).toBe("96.0%");
    expect(formatValue("TOTAL_DAYS", 412)).toBe("412일");
    expect(formatValue("MAX_STREAK", 13)).toBe("13일");
  });

  it("누적 시간은 분을 내리고 1시간 미만은 분, 이상은 시간·분이다", () => {
    expect(formatValue("TOTAL_TIME", 2520)).toBe("42분");
    expect(formatValue("TOTAL_TIME", 2579)).toBe("42분");
    expect(formatValue("TOTAL_TIME", 30)).toBe("1분");
    expect(formatValue("TOTAL_TIME", 0)).toBe("1분");
    expect(formatValue("TOTAL_TIME", 3599)).toBe("59분");
    expect(formatValue("TOTAL_TIME", 3600)).toBe("1시간");
    expect(formatValue("TOTAL_TIME", 1_508_400)).toBe("419시간");
    expect(formatValue("TOTAL_TIME", 1_509_120)).toBe("419시간 12분");
    expect(formatValue("TOTAL_TIME", 17_325_000)).toBe("4,812시간 30분");
  });
});

describe("차이", () => {
  it("1시간 미만은 분 올림(최소 1분), 이상은 시간·분", () => {
    expect(formatGapDuration(1320)).toBe("22분");
    expect(formatGapDuration(61)).toBe("2분");
    expect(formatGapDuration(1)).toBe("1분");
    expect(formatGapDuration(0)).toBe("1분");
    expect(formatGapDuration(3599)).toBe("1시간");
    expect(formatGapDuration(12000)).toBe("3시간 20분");
    expect(formatGapDuration(100800)).toBe("28시간");
  });

  it("집중률은 %, 일수 판은 일", () => {
    expect(formatGap("FOCUS_RATE", 0.4)).toBe("0.4%");
    expect(formatGap("TOTAL_DAYS", 3)).toBe("3일");
    expect(formatGap("FOCUS_TIME", 540)).toBe("9분");
    expect(formatGap("TOTAL_TIME", 12000)).toBe("3시간 20분");
  });

  it("일수 차이는 같은 값이어도 최소 1일이다", () => {
    expect(formatGap("TOTAL_DAYS", 0)).toBe("1일");
    expect(formatGap("MAX_STREAK", 0)).toBe("1일");
    expect(formatGap("TOTAL_DAYS", 1)).toBe("1일");
    expect(formatGap("MAX_STREAK", 4)).toBe("4일");
    expect(formatGap("TOTAL_DAYS", 1205)).toBe("1,205일");
  });
});

describe("마감", () => {
  const closesAt = "2026-10-11T15:00:00Z";
  const weekly = { type: "FOCUS_TIME", period: "WEEKLY", slot: null, closesAt } as const;
  const at = (msBefore: number) => Date.parse(closesAt) - msBefore;

  it("일간은 고정 문구이고 심야 구간만 04시다", () => {
    expect(formatDeadline({ ...weekly, period: "DAILY" }, at(1000))).toBe("00시 마감");
    expect(
      formatDeadline({ type: "TIME_SLOT", period: "DAILY", slot: "NIGHT", closesAt }, at(1000)),
    ).toBe("04시 마감");
  });

  it("주간·월간은 남은 시간을 단위에 맞춰 줄인다", () => {
    expect(formatDeadline(weekly, at((3 * 24 + 14) * 3_600_000 + 59_000))).toBe("마감 3일 14시간");
    expect(formatDeadline(weekly, at(3 * 24 * 3_600_000))).toBe("마감 3일");
    expect(formatDeadline(weekly, at(5 * 3_600_000 + 20 * 60_000))).toBe("마감 5시간 20분");
    expect(formatDeadline(weekly, at(5 * 3_600_000))).toBe("마감 5시간");
    expect(formatDeadline(weekly, at(12 * 60_000 + 30_000))).toBe("마감 13분");
    expect(formatDeadline(weekly, at(-10_000))).toBe("마감 1분");
  });

  it("분을 올려 60분이 되면 시간으로 쓴다", () => {
    expect(formatDeadline(weekly, at(59 * 60_000 + 30_000))).toBe("마감 1시간");
  });

  it("명예의 전당은 마감이 없다", () => {
    expect(
      formatDeadline({ type: "TOTAL_TIME", period: null, slot: null, closesAt: null }, 0),
    ).toBeNull();
  });

  it("서버 시각 기준으로 남은 시간을 센다", () => {
    // 기기 시계가 2시간 빠르게 맞춰져 있어도 응답을 받은 뒤 지난 시간만 더한다.
    const asOf = "2026-10-11T10:00:00Z";
    const deviceReceivedAt = Date.parse(asOf) + 2 * 3_600_000;
    const deviceNow = deviceReceivedAt + 30 * 60_000;

    const now = serverNowMs(asOf, deviceReceivedAt, deviceNow);

    expect(now).toBe(Date.parse(asOf) + 30 * 60_000);
    expect(formatDeadline(weekly, now)).toBe("마감 4시간 30분");
  });
});

describe("진행바", () => {
  it("차이가 0이면 100%, 창 이상이면 최소 6%다", () => {
    expect(progressPercent("FOCUS_TIME", 0)).toBe(100);
    expect(progressPercent("FOCUS_TIME", 1320)).toBe(45);
    expect(progressPercent("FOCUS_TIME", 2400)).toBe(6);
    expect(progressPercent("TIME_SLOT", 9000)).toBe(6);
    expect(progressPercent("FOCUS_RATE", 0.4)).toBe(80);
    expect(progressPercent("TOTAL_TIME", 12000)).toBe(67);
    expect(progressPercent("TOTAL_DAYS", 3)).toBe(70);
  });
});

describe("날짜와 기록 항목", () => {
  it("월·일과 그 달의 몇째 주(목요일이 속한 달 기준)", () => {
    expect(formatMonthDay("2026-09-14")).toBe("9월 14일");
    expect(weekOfMonthLabel("2026-09-28")).toBe("10월 1주");
    expect(weekOfMonthLabel("2026-10-05")).toBe("10월 2주");
    expect(weekOfMonthLabel("2026-09-21")).toBe("9월 4주");
    expect(weekOfMonthLabel("2026-08-31")).toBe("9월 1주");
  });

  it("기록이 속한 달은 주간이면 그 주 목요일의 달이다", () => {
    expect(recordMonthKey({ period: "WEEKLY", periodStart: "2026-09-28" })).toBe("2026-10");
    expect(recordMonthKey({ period: "DAILY", periodStart: "2026-09-28" })).toBe("2026-09");
    expect(recordMonthKey({ period: "MONTHLY", periodStart: "2026-09-01" })).toBe("2026-09");
  });

  it("기록 이름·기간·값", () => {
    const slot = {
      type: "TIME_SLOT",
      period: "DAILY",
      slot: "MORNING",
      periodStart: "2026-10-09",
      value: 11060,
    } as const;
    const weekly = {
      type: "FOCUS_TIME",
      period: "WEEKLY",
      slot: null,
      periodStart: "2026-09-28",
      value: 148800,
    } as const;
    const rate = {
      type: "FOCUS_RATE",
      period: "MONTHLY",
      slot: null,
      periodStart: "2026-09-01",
      value: 98.7,
    } as const;

    expect([recordName(slot), recordPeriod(slot), recordValue(slot)]).toEqual([
      "오전 구간",
      "일간 · 10월 9일",
      "3:04:20",
    ]);
    expect([recordName(weekly), recordPeriod(weekly), recordValue(weekly)]).toEqual([
      "순공",
      "주간 · 10월 1주",
      "41:20:00",
    ]);
    expect([recordName(rate), recordPeriod(rate), recordValue(rate)]).toEqual([
      "집중률",
      "월간 · 9월",
      "98.7%",
    ]);
    expect(recordPeriodShort(slot)).toBe("10월 9일");
  });
});
