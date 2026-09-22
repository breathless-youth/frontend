import { describe, expect, it } from "vitest";

import { daysUntil, formatDday, todayLocalDateKey } from "../ddayFormat";

// 기기 로컬 2026-09-23 정오
const NOW = new Date(2026, 8, 23, 12, 0, 0);

describe("daysUntil", () => {
  it("당일은 0, 앞은 양수, 지난 뒤는 음수다", () => {
    expect(daysUntil("2026-09-23", NOW)).toBe(0);
    expect(daysUntil("2026-09-24", NOW)).toBe(1);
    expect(daysUntil("2027-01-09", NOW)).toBe(108);
    expect(daysUntil("2026-09-20", NOW)).toBe(-3);
  });

  it("시각이 아니라 날짜로 센다 — 자정 직전이어도 오늘은 오늘이다", () => {
    const lateNight = new Date(2026, 8, 23, 23, 59, 59);
    expect(daysUntil("2026-09-24", lateNight)).toBe(1);
  });
});

describe("formatDday", () => {
  it("D-N · D-Day · D+N", () => {
    expect(formatDday(52)).toBe("D-52");
    expect(formatDday(0)).toBe("D-Day");
    expect(formatDday(-3)).toBe("D+3");
  });
});

describe("todayLocalDateKey", () => {
  it("날짜 입력의 min에 넣을 YYYY-MM-DD를 만든다", () => {
    expect(todayLocalDateKey(NOW)).toBe("2026-09-23");
    expect(todayLocalDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
