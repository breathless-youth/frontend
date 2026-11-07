import { afterEach, describe, expect, it } from "vitest";

import i18n from "@/lib/i18n";

import { daysUntil, formatDday, formatKoreanDate } from "../ddayFormat";

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

  describe("영어", () => {
    afterEach(async () => {
      await i18n.changeLanguage("ko");
    });

    it("남은 날과 지난 날을 단수·복수로 나눠 쓴다", async () => {
      await i18n.changeLanguage("en");
      expect(formatDday(52)).toBe("52 days left");
      expect(formatDday(1)).toBe("1 day left");
      expect(formatDday(0)).toBe("Today");
      expect(formatDday(-1)).toBe("1 day ago");
      expect(formatDday(-3)).toBe("3 days ago");
    });
  });

  describe("일본어·중국어(번체)", () => {
    afterEach(async () => {
      await i18n.changeLanguage("ko");
    });

    // count를 넘겨도 복수 범주가 하나뿐인 언어는 접미 없는 키로 떨어져야 한다
    it("일본어는 あと N日 · 当日 · N日経過", async () => {
      await i18n.changeLanguage("ja");
      expect(formatDday(1)).toBe("あと1日");
      expect(formatDday(52)).toBe("あと52日");
      expect(formatDday(0)).toBe("当日");
      expect(formatDday(-1)).toBe("1日経過");
    });

    it("중국어(번체)는 倒數 N 天 · 就是今天 · 已過 N 天", async () => {
      await i18n.changeLanguage("zh-Hant");
      expect(formatDday(1)).toBe("倒數 1 天");
      expect(formatDday(52)).toBe("倒數 52 天");
      expect(formatDday(0)).toBe("就是今天");
      expect(formatDday(-1)).toBe("已過 1 天");
    });
  });
});

describe("formatKoreanDate", () => {
  it("접힌 칩에 보이는 `M월 D일 (요일)`", () => {
    expect(formatKoreanDate("2027-11-18")).toBe("11월 18일 (목)");
    expect(formatKoreanDate("2026-09-23")).toBe("9월 23일 (수)");
  });
});
