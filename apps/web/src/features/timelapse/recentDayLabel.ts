import { dateKeyOfDate, formatMonthDay } from "@/features/records/recordsFormat";
import i18n from "@/lib/i18n";
import { formatClock } from "@/lib/intl";
import type { AppLocale } from "@/lib/locale";

const DAY_MS = 86_400_000;

function startOfDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** 카드 날짜. 오늘·어제는 말로, 그 밖에는 `M월 D일`로 쓴다. */
export function recentDayLabel(startedAtMs: number, nowMs: number): string {
  const days = Math.round((startOfDay(nowMs) - startOfDay(startedAtMs)) / DAY_MS);
  if (days === 0) return i18n.t("timelapse:day.today");
  if (days === 1) return i18n.t("timelapse:day.yesterday");
  return formatMonthDay(dateKeyOfDate(new Date(startedAtMs)));
}

function clock(ms: number): string {
  return formatClock(i18n.language as AppLocale, new Date(ms));
}

/** 전체 목록 한 줄의 날짜와 시각. 기록·결과 화면과 같은 엔대시로 잇는다. */
export function timelapseRangeLabel(startedAtMs: number, endedAtMs: number): string {
  const date = formatMonthDay(dateKeyOfDate(new Date(startedAtMs)), true);
  return `${date} ${clock(startedAtMs)} – ${clock(endedAtMs)}`;
}

/** 같은 날 여러 타임랩스를 스크린리더가 구분하도록 시작 시각까지 붙인다. */
export function timelapseStartLabel(startedAtMs: number): string {
  return `${formatMonthDay(dateKeyOfDate(new Date(startedAtMs)))} ${clock(startedAtMs)}`;
}
