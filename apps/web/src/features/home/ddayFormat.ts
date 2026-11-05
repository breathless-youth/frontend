import { formatMonthDay } from "@/features/records/recordsFormat";
import i18n from "@/lib/i18n";

const DAY_MS = 24 * 60 * 60 * 1000;

function localMidnight(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, day);
}

/**
 * 목표일까지 남은 날. 기기 로컬 날짜 기준이라 사용자가 보는 달력과 같고, 자정을 넘기면
 * 홈에 다시 들어올 때 바뀐다. 당일은 0, 지난 뒤는 음수.
 */
export function daysUntil(targetDate: string, now: Date = new Date()): number {
  const [year, month, day] = targetDate.split("-").map(Number);
  const target = localMidnight(year, month - 1, day);
  const today = localMidnight(now.getFullYear(), now.getMonth(), now.getDate());
  // 서머타임이 있는 지역에서 하루가 23·25시간일 수 있어 나눗셈 뒤 반올림한다
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

/**
 * 목표일 표기
 *
 * 한국어는 `D-52` · `D-Day` · `D+3`, 영어는 `52 days left` · `Today` · `3 days ago`다.
 * 영어는 날 수에 따라 단수·복수가 갈려서 count를 같이 넘긴다.
 */
export function formatDday(daysLeft: number): string {
  if (daysLeft === 0) {
    return i18n.t("home:dday.today");
  }
  const days = Math.abs(daysLeft);
  return daysLeft > 0
    ? i18n.t("home:dday.remaining", { days, count: days })
    : i18n.t("home:dday.passed", { days, count: days });
}

/** 시트가 접혔을 때 칩에 보이는 날짜 — `11월 18일 (목)` · `Thu, November 18`. */
export function formatKoreanDate(dateKey: string): string {
  return formatMonthDay(dateKey, true);
}
