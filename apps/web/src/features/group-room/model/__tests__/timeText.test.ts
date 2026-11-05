import { describe, expect, it } from "vitest";

import {
  appliedAtText,
  formatClock,
  formatHoursMinutes,
  lastStudiedText,
  remainingText,
} from "../timeText";

/** 한국 시간 2026년 11월 2일 오전 10시. */
const NOW = new Date("2026-11-02T10:00:00+09:00");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const later = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatClock", () => {
  it("시:분:초이고 시는 0으로 채우지 않는다", () => {
    expect(formatClock(11_560)).toBe("3:12:40");
    expect(formatClock(0)).toBe("0:00:00");
    expect(formatClock(78_010)).toBe("21:40:10");
    expect(formatClock(360_000)).toBe("100:00:00");
  });
});

describe("formatHoursMinutes", () => {
  it("시간과 분이고 0인 쪽은 뺀다", () => {
    expect(formatHoursMinutes(76_200)).toBe("21시간 10분");
    expect(formatHoursMinutes(54_300)).toBe("15시간 5분");
    expect(formatHoursMinutes(3_600)).toBe("1시간");
    expect(formatHoursMinutes(600)).toBe("10분");
    expect(formatHoursMinutes(59)).toBe("0분");
  });
});

describe("lastStudiedText", () => {
  it("1시간 안은 오늘, 같은 날은 몇 시간 전, 전날은 어제, 그 전은 며칠 전이다", () => {
    expect(lastStudiedText(ago(30 * MIN), NOW)).toBe("오늘");
    expect(lastStudiedText(ago(2 * HOUR), NOW)).toBe("2시간 전");
    expect(lastStudiedText("2026-11-01T23:50:00+09:00", NOW)).toBe("어제");
    expect(lastStudiedText("2026-10-30T12:00:00+09:00", NOW)).toBe("3일 전");
    expect(lastStudiedText("2026-10-17T09:00:00+09:00", NOW)).toBe("16일 전");
  });

  it("자정을 넘으면 1시간 안이라도 어제다", () => {
    expect(
      lastStudiedText("2026-11-01T23:50:00+09:00", new Date("2026-11-02T00:10:00+09:00")),
    ).toBe("어제");
  });

  it("공부한 적이 없으면 표기가 없다", () => {
    expect(lastStudiedText(null, NOW)).toBeNull();
  });

  it("기기 시계가 늦어 지금보다 뒤의 시각이 와도 음수로 적지 않는다", () => {
    expect(lastStudiedText(later(5 * MIN), NOW)).toBe("오늘");
    expect(
      lastStudiedText("2026-11-03T00:02:00+09:00", new Date("2026-11-02T23:58:00+09:00")),
    ).toBe("오늘");
    expect(appliedAtText(later(5 * MIN), NOW)).toBe("방금 신청");
  });
});

describe("appliedAtText", () => {
  it("1시간 안은 방금, 같은 날은 몇 시간 전, 전날은 어제, 그 전은 며칠 전 신청이다", () => {
    expect(appliedAtText(ago(10 * MIN), NOW)).toBe("방금 신청");
    expect(appliedAtText(ago(3 * HOUR), NOW)).toBe("3시간 전 신청");
    expect(appliedAtText("2026-11-01T20:00:00+09:00", NOW)).toBe("어제 신청");
    expect(appliedAtText("2026-10-31T20:00:00+09:00", NOW)).toBe("2일 전 신청");
  });
});

describe("remainingText", () => {
  it("일과 시간, 하루가 안 남으면 시간, 한 시간이 안 남으면 분이다", () => {
    expect(remainingText(later(2 * DAY + 23 * HOUR + 30 * MIN), NOW)).toBe("2일 23시간");
    expect(remainingText(later(2 * DAY), NOW)).toBe("2일");
    expect(remainingText(later(23 * HOUR), NOW)).toBe("23시간");
    expect(remainingText(later(59 * MIN), NOW)).toBe("59분");
  });

  it("1분 미만이나 지난 시각은 1분이다", () => {
    expect(remainingText(later(30_000), NOW)).toBe("1분");
    expect(remainingText(ago(5 * MIN), NOW)).toBe("1분");
  });
});
