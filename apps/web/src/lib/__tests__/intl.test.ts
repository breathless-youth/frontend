import { describe, expect, it } from "vitest";

import { mockDeviceTimeZone } from "@/test/deviceTimeZone";

import { formatClock, formatClockRange, formatDateLabel, formatMonthLabel } from "../intl";

const spaces = (s: string) => s.replace(/\u202f/g, " ");
// 2026-10-01 21:03 KST = 2026-10-01 08:03 뉴욕(EDT)
const at = new Date("2026-10-01T12:03:00Z");
const end = new Date("2026-10-01T13:48:00Z");

describe("intl", () => {
  it("시간대를 넘기지 않으면 기기 시간대로 쓴다", () => {
    mockDeviceTimeZone("America/New_York");
    expect(formatClock("ko", at)).toBe("08:03");
    expect(formatClock("ko", at, "Asia/Seoul")).toBe("21:03");
  });

  it.each([
    ["ko", "10월 1일 목요일"],
    ["en", "Thursday, October 1"],
  ] as const)("날짜 라벨 %s", (locale, expected) => {
    expect(formatDateLabel(locale, at)).toBe(expected);
  });

  it("날짜 라벨은 시간대를 받으면 그 시간대의 날짜를 쓴다", () => {
    const lateUtc = new Date("2026-10-01T20:00:00Z"); // KST 10/2 05:00, 뉴욕 10/1 16:00
    expect(formatDateLabel("ko", lateUtc)).toBe("10월 2일 금요일");
    expect(formatDateLabel("ko", lateUtc, "America/New_York")).toBe("10월 1일 목요일");
  });

  it.each([
    ["ko", "2026년 10월"],
    ["en", "October 2026"],
  ] as const)("월 라벨 %s", (locale, expected) => {
    expect(formatMonthLabel(locale, at)).toBe(expected);
  });

  it.each([
    ["ko", "Asia/Seoul", "21:03"],
    ["en", "Asia/Seoul", "9:03 PM"],
    ["ko", "America/New_York", "08:03"],
    ["en", "America/New_York", "8:03 AM"],
  ] as const)("시각 %s %s", (locale, tz, expected) => {
    expect(spaces(formatClock(locale, at, tz))).toBe(expected);
  });

  it("한국어 자정은 00시로 쓴다", () => {
    expect(formatClock("ko", new Date("2026-10-01T15:00:00Z"))).toBe("00:00");
  });

  it.each([
    ["ko", "21:03 – 22:48"],
    ["en", "9:03 PM – 10:48 PM"],
  ] as const)("시각 범위 %s", (locale, expected) => {
    expect(spaces(formatClockRange(locale, at, end))).toBe(expected);
  });
});
