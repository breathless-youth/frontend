import type { DailyStudyStat } from "@focusmakers/types";

import type { DateRange } from "@/lib/statsApi";

import { type CalendarMonth, addDaysToDateKey, weekdayIndexOfDateKey } from "./recordsFormat";

/**
 * 기록 탭 v2의 주간·월간 조회 범위와 헤더 숫자 — 순수 함수 (BY-735).
 *
 * `GET /api/stats/period`는 일별 배열만 주고 합계·증감은 앱이 계산한다(BY-454 설계 원칙). 주간 뷰는
 * **월요일 시작**이다(BY-564 시안 확정) — `recordsFormat.weekDateKeys`(일요일 시작, v1 스트릭 배너용)와 다르다.
 */

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** `dateKey`가 속한 주(월~일) 7일의 키. */
export function mondayWeekDateKeys(dateKey: string): string[] {
  const monday = addDaysToDateKey(dateKey, -((weekdayIndexOfDateKey(dateKey) + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDaysToDateKey(monday, i));
}

/** 주간 뷰 조회 범위 — 그 주(월~일)와 직전 주. `period` 호출 하나로 막대와 증감을 다 그린다. */
export function weekRanges(dateKey: string): { range: DateRange; compareRange: DateRange } {
  const week = mondayWeekDateKeys(dateKey);
  const from = week[0]!;
  const to = week[6]!;
  return {
    range: { from, to },
    compareRange: { from: addDaysToDateKey(from, -7), to: addDaysToDateKey(to, -7) },
  };
}

function lastDayOfMonth({ year, month }: CalendarMonth): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthRange({ year, month }: CalendarMonth): DateRange {
  const prefix = `${year}-${pad2(month)}`;
  return { from: `${prefix}-01`, to: `${prefix}-${pad2(lastDayOfMonth({ year, month }))}` };
}

/** 월간 뷰 조회 범위 — 그 달 1일~말일과 직전 달. 달마다 길이가 달라도 서버는 두 배열을 그대로 준다. */
export function monthRanges(month: CalendarMonth): { range: DateRange; compareRange: DateRange } {
  const previous: CalendarMonth =
    month.month === 1
      ? { year: month.year - 1, month: 12 }
      : { year: month.year, month: month.month - 1 };
  return { range: monthRange(month), compareRange: monthRange(previous) };
}

export function sumFocusSec(daily: readonly DailyStudyStat[]): number {
  return daily.reduce((sum, day) => sum + day.focusSec, 0);
}

/** 지난 기간 대비 순공 증감(초) — 양수면 늘었다. 헤더의 "지난주보다 N 늘었어요". */
export function focusDeltaSec(
  daily: readonly DailyStudyStat[],
  compareDaily: readonly DailyStudyStat[],
): number {
  return sumFocusSec(daily) - sumFocusSec(compareDaily);
}

/** 가장 오래 공부한 날 — "이 달 최고 기록". 기록이 없으면 null, 동률이면 앞 날짜. */
export function bestDay(daily: readonly DailyStudyStat[]): DailyStudyStat | null {
  let best: DailyStudyStat | null = null;
  for (const day of daily) {
    if (day.focusSec > 0 && (best === null || day.focusSec > best.focusSec)) {
      best = day;
    }
  }
  return best;
}

/** 공부한 날 수 — "이 달 공부 N일". 서버 집계가 순공 1분 미만 세션을 뺀 뒤라 focusSec > 0이 곧 기준이다. */
export function studiedDayCount(daily: readonly DailyStudyStat[]): number {
  return daily.filter((day) => day.focusSec > 0).length;
}
