import type { DailyStudyStat } from "@focusmakers/types";

import type { DateRange } from "@/lib/statsApi";

import {
  type CalendarMonth,
  addDaysToDateKey,
  dayOfDateKey,
  formatDuration,
  isDateKeyInMonth,
  isFutureDateKey,
  mondayIndexOfDateKey,
  monthOfDateKey,
} from "./recordsFormat";

/**
 * 기록 탭 주간·월간 조회 범위와 헤더 숫자
 *
 * `GET /api/stats/period`는 일별 배열만 주고 합계·증감은 앱이 계산한다. 시안이 주 시작을 월요일로 정해서
 * 주간 뷰는 월요일에 시작한다. `recordsFormat.weekDateKeys`는 일요일에 시작하는 v1 스트릭 배너용이라 다르다.
 */

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** `dateKey`가 속한 주(월~일) 7일의 키. */
export function mondayWeekDateKeys(dateKey: string): string[] {
  const monday = addDaysToDateKey(dateKey, -mondayIndexOfDateKey(dateKey));
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

/**
 * 미래 달인가 — 그 달 1일이 오늘이 속한 달보다 미래. 오늘이 속한 현재 달은 미래가 아니다.
 * 미래 기간은 서버가 0으로 채운 데이터와 과거 비교값을 견줘 "줄었어요"가 뜨는 버그를 막는다.
 */
export function isFutureMonth(month: CalendarMonth, todayKey: string): boolean {
  const today = monthOfDateKey(todayKey);
  return month.year > today.year || (month.year === today.year && month.month > today.month);
}

/**
 * 미래 주인가 — 그 주 월요일이 오늘보다 미래. 오늘을 포함하는 현재 주는 미래가 아니다
 * (오늘이 월요일이면 월요일 === 오늘이라 미래가 아니다).
 */
export function isFutureWeek(weekAnchorKey: string, todayKey: string): boolean {
  return isFutureDateKey(mondayWeekDateKeys(weekAnchorKey)[0]!, todayKey);
}

export function sumFocusSec(daily: readonly DailyStudyStat[]): number {
  return daily.reduce((sum, day) => sum + day.focusSec, 0);
}

/** 지난 기간 대비 순공 증감(초) — 양수면 늘었다. 완료된 과거 기간의 전체 vs 전체 비교에 쓴다. */
export function focusDeltaSec(
  daily: readonly DailyStudyStat[],
  compareDaily: readonly DailyStudyStat[],
): number {
  return sumFocusSec(daily) - sumFocusSec(compareDaily);
}

/** 조건에 맞는 날만 합산한 순공 초. */
function sumFocusWhere(daily: readonly DailyStudyStat[], keep: (date: string) => boolean): number {
  return sumFocusSec(daily.filter((day) => keep(day.date)));
}

/**
 * 주간 순공 증감(초) — "같은 경과 기간끼리" 비교.
 *
 * 진행 중인 주(오늘이 그 주에 포함)면 이번 주는 오늘까지, 지난주는 같은 요일까지만 합산해 견준다
 * (주 초에 "이번 주 하루 vs 지난주 7일 전체"로 항상 크게 줄어 보이는 버그를 막는다).
 * 완료된 과거 주(또는 숨겨지는 미래 주)는 전체 vs 전체다.
 */
export function weekFocusDeltaSec(
  daily: readonly DailyStudyStat[],
  compareDaily: readonly DailyStudyStat[],
  weekAnchorKey: string,
  todayKey: string,
): number {
  const week = mondayWeekDateKeys(weekAnchorKey);
  const inProgress = !isFutureDateKey(week[0]!, todayKey) && !isFutureDateKey(todayKey, week[6]!); // 월≤오늘≤일
  if (!inProgress) {
    return focusDeltaSec(daily, compareDaily);
  }
  const todayMondayIndex = mondayIndexOfDateKey(todayKey);
  const thisSum = sumFocusWhere(daily, (date) => !isFutureDateKey(date, todayKey));
  const lastSum = sumFocusWhere(
    compareDaily,
    (date) => mondayIndexOfDateKey(date) <= todayMondayIndex,
  );
  return thisSum - lastSum;
}

/**
 * 월간 순공 증감(초) — "같은 경과 기간끼리" 비교.
 *
 * 진행 중인 달(오늘이 그 달)이면 이번 달은 오늘까지, 지난달은 같은 '일'까지만 합산해 견준다.
 * 완료된 과거 달(또는 숨겨지는 미래 달)은 전체 vs 전체다.
 */
export function monthFocusDeltaSec(
  daily: readonly DailyStudyStat[],
  compareDaily: readonly DailyStudyStat[],
  month: CalendarMonth,
  todayKey: string,
): number {
  if (!isDateKeyInMonth(todayKey, month)) {
    return focusDeltaSec(daily, compareDaily);
  }
  const todayDay = dayOfDateKey(todayKey);
  const thisSum = sumFocusWhere(daily, (date) => !isFutureDateKey(date, todayKey));
  const lastSum = sumFocusWhere(compareDaily, (date) => dayOfDateKey(date) <= todayDay);
  return thisSum - lastSum;
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

/** 날짜 키 → 순공시간(초). 달력이 날짜별 순공시간을 O(1)로 찾는다. */
export function buildDayFocusMap(daily: readonly DailyStudyStat[]): Map<string, number> {
  return new Map(daily.map((day) => [day.date, day.focusSec]));
}

/**
 * 주간 추이 차트 계산 (WeekTrendChart가 그리기만 하도록 순수 TS로 분리)
 *
 * `GET /api/stats/period`는 기간 전체를 0으로 채워 주므로, 아직 오지 않은 요일도 focusSec 0으로
 * 내려온다. 그 0을 선으로 그리면 선이 미래까지 이어진다 — 이번 주·지난주 **둘 다** `todayKey` 이후
 * 날짜를 `null`로 둬 선/끝점에서 뺀다(미래 주로 이동해도 지난주 선이 미래 요일에 0으로 그려지지
 * 않게 하는 대칭 처리).
 */

/** y축 상한(시간). 12를 넘으면 clamp해 축이 튀지 않게 한다. */
export const MAX_CHART_HOURS = 12;

/** 월요일 시작 7칸. XAxis 눈금 순서이자 슬롯 인덱스다. */
const CHART_WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"] as const;

type ChartWeekday = (typeof CHART_WEEKDAY_LABELS)[number];

/** 순공 초 → 시간, `MAX_CHART_HOURS`에서 clamp(축이 튀지 않게). */
export function toChartHours(focusSec: number): number {
  return Math.min(focusSec / 3600, MAX_CHART_HOURS);
}

/** 요일별 순공 초(월~일). 미래 요일·기록 없는 요일은 `null`이다. */
interface WeekTrendPoint {
  day: ChartWeekday;
  thisWeekSec: number | null;
  lastWeekSec: number | null;
}

/**
 * 요일 인덱스로 이번 주·지난주 순공 초를 정렬한다.
 * 이번 주·지난주 **둘 다** `todayKey` 이후 날짜를 건너뛰어 미래 0이 선에 들어가지 않게 한다.
 */
export function weekTrendPoints(
  daily: readonly DailyStudyStat[],
  compareDaily: readonly DailyStudyStat[],
  todayKey: string,
): WeekTrendPoint[] {
  const points: WeekTrendPoint[] = CHART_WEEKDAY_LABELS.map((day) => ({
    day,
    thisWeekSec: null,
    lastWeekSec: null,
  }));
  for (const stat of daily) {
    if (isFutureDateKey(stat.date, todayKey)) {
      continue; // 미래 요일(0으로 채워짐)은 선에서 뺀다
    }
    const point = points[mondayIndexOfDateKey(stat.date)];
    if (point) {
      point.thisWeekSec = stat.focusSec;
    }
  }
  for (const stat of compareDaily) {
    if (isFutureDateKey(stat.date, todayKey)) {
      continue; // 지난주도 대칭으로 미래 요일 제외(미래 주 이동 시 0 선 방지)
    }
    const point = points[mondayIndexOfDateKey(stat.date)];
    if (point) {
      point.lastWeekSec = stat.focusSec;
    }
  }
  return points;
}

/**
 * 차트 선이 읽는 행.
 * - `thisWeek`/`lastWeek`: 선이 그리는 값 — `MAX_CHART_HOURS`로 clamp된 시간(미래/기록 없음은 `null`).
 * - `thisWeekSec`/`lastWeekSec`: 툴팁용 clamp 전 원본 순공 초 — 12h 초과여도 실제 값을 정확히 보여준다.
 */
export interface WeekTrendRow {
  day: ChartWeekday;
  thisWeek: number | null;
  lastWeek: number | null;
  thisWeekSec: number | null;
  lastWeekSec: number | null;
}

/** `weekTrendPoints`의 초를 clamp된 시간으로 바꾼 차트 행(원본 초도 함께 담아 툴팁이 정확히 쓰게 한다). */
export function buildWeekTrendRows(
  daily: readonly DailyStudyStat[],
  compareDaily: readonly DailyStudyStat[],
  todayKey: string,
): WeekTrendRow[] {
  return weekTrendPoints(daily, compareDaily, todayKey).map((point) => ({
    day: point.day,
    thisWeek: point.thisWeekSec === null ? null : toChartHours(point.thisWeekSec),
    lastWeek: point.lastWeekSec === null ? null : toChartHours(point.lastWeekSec),
    thisWeekSec: point.thisWeekSec,
    lastWeekSec: point.lastWeekSec,
  }));
}

/**
 * 툴팁 한 항목의 순공시간 표기 — clamp 전 원본 초를 사람이 읽는 길이로.
 * 값이 `null`(미래 요일·기록 없음)이면 `null`을 돌려 그 항목을 아예 표시하지 않게 한다(0시간 오해 방지).
 */
export function weekTrendTooltipDuration(focusSec: number | null): string | null {
  return focusSec === null ? null : formatDuration(focusSec);
}

/**
 * 비율 분모가 되는 그 달의 경과일 (MonthTiles "이 달 공부"):
 * - 오늘이 속한 달이면 오늘 일자(그 달 1일부터 오늘까지)
 * - 과거 달이면 말일, 미래 달이면 0
 */
export function elapsedDaysInMonth(month: CalendarMonth, todayKey: string): number {
  if (isDateKeyInMonth(todayKey, month)) {
    return dayOfDateKey(todayKey);
  }
  const firstDayKey = `${month.year}-${pad2(month.month)}-01`;
  if (firstDayKey > todayKey) {
    return 0; // 미래 달
  }
  return lastDayOfMonth(month); // 과거 달 말일
}

/** 공부 일수 / 경과일 비율(%) — 경과일 0이면 0%로 방어한다. */
export function studiedRatioPercent(studiedDays: number, elapsedDays: number): number {
  return elapsedDays === 0 ? 0 : Math.round((studiedDays / elapsedDays) * 100);
}
