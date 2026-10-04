import type { DailyStudyStat } from "@focusmakers/types";

import type { DateRange } from "@/lib/statsApi";

import {
  type CalendarMonth,
  addDaysToDateKey,
  dayOfDateKey,
  isFutureDateKey,
  MONDAY_FIRST_WEEKDAY_LABELS,
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

/** 진행 중인 주인가 — 오늘이 그 주(월~일)에 들어 있다. */
export function isWeekInProgress(weekAnchorKey: string, todayKey: string): boolean {
  const week = mondayWeekDateKeys(weekAnchorKey);
  return !isFutureDateKey(week[0]!, todayKey) && !isFutureDateKey(todayKey, week[6]!); // 월≤오늘≤일
}

/** 주 범위 라벨 `9월 14일 ~ 20일`. 달이 바뀌는 주는 `9월 28일 ~ 10월 4일`. */
export function weekRangeLabel(weekAnchorKey: string): string {
  const week = mondayWeekDateKeys(weekAnchorKey);
  const from = week[0]!;
  const to = week[6]!;
  const start = `${monthOfDateKey(from).month}월 ${dayOfDateKey(from)}일`;
  const sameMonth = monthOfDateKey(from).month === monthOfDateKey(to).month;
  const end = sameMonth
    ? `${dayOfDateKey(to)}일`
    : `${monthOfDateKey(to).month}월 ${dayOfDateKey(to)}일`;
  return `${start} ~ ${end}`;
}

/**
 * 오늘 기준으로 그 주를 부르는 말 — `이번 주` · `지난주` · `N주 전`.
 * 추이 차트 범례가 쓴다(과거 주를 볼 때 `지난주 · 2주 전`).
 */
export function relativeWeekLabel(weekAnchorKey: string, todayKey: string, offset = 0): string {
  const thisMonday = Date.parse(`${mondayWeekDateKeys(todayKey)[0]!}T00:00:00Z`);
  const monday = Date.parse(`${mondayWeekDateKeys(weekAnchorKey)[0]!}T00:00:00Z`);
  const weeksAgo = Math.round((thisMonday - monday) / (7 * 24 * 3600 * 1000)) + offset;
  if (weeksAgo <= 0) {
    return "이번 주";
  }
  return weeksAgo === 1 ? "지난주" : `${String(weeksAgo)}주 전`;
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
  if (!isWeekInProgress(weekAnchorKey, todayKey)) {
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

/**
 * 하루 평균 순공(초) — 합계 ÷ 공부한 날 수. 쉰 날로 평균이 깎이지 않게 공부한 날만 센다.
 * 공부한 날이 없으면 `null`(화면은 `—`).
 */
export function averageFocusSecPerStudiedDay(daily: readonly DailyStudyStat[]): number | null {
  const days = studiedDayCount(daily);
  return days === 0 ? null : Math.floor(sumFocusSec(daily) / days);
}

export function sumStudySec(daily: readonly DailyStudyStat[]): number {
  return daily.reduce((sum, day) => sum + day.studySec, 0);
}

/** 하루 평균 공부시간(초) — 총 공부 합계 ÷ 공부한 날 수. 공부한 날이 없으면 `null`. */
export function averageStudySecPerStudiedDay(daily: readonly DailyStudyStat[]): number | null {
  const days = studiedDayCount(daily);
  return days === 0 ? null : Math.floor(sumStudySec(daily) / days);
}

/**
 * 기간 평균 집중률(%) — 순공 합계 ÷ 총 공부 합계. 날짜별 집중률의 단순 평균이 아니다
 * (짧게 공부한 날이 긴 날과 같은 무게를 갖지 않게). 총 공부가 0이면 `null`.
 */
export function averageFocusRatePercent(daily: readonly DailyStudyStat[]): number | null {
  const study = sumStudySec(daily);
  return study === 0 ? null : Math.round((sumFocusSec(daily) / study) * 100);
}

/**
 * 추이 카드 제목이 말할 비교 — 두 주의 기록 유무로 갈린다.
 * 진행 중인 주는 같은 경과 기간끼리, 끝난 주는 전체끼리 견준다(`weekFocusDeltaSec`).
 */
export type WeekComparison =
  | { kind: "delta"; inProgress: boolean; deltaSec: number }
  | { kind: "no-previous"; inProgress: boolean; totalSec: number }
  | { kind: "no-current"; inProgress: boolean }
  | { kind: "empty"; inProgress: boolean };

export function weekComparison(
  daily: readonly DailyStudyStat[],
  compareDaily: readonly DailyStudyStat[],
  weekAnchorKey: string,
  todayKey: string,
): WeekComparison {
  const inProgress = isWeekInProgress(weekAnchorKey, todayKey);
  const totalSec = sumFocusSec(daily);
  const previousSec = sumFocusSec(compareDaily);
  if (totalSec === 0) {
    return previousSec === 0 ? { kind: "empty", inProgress } : { kind: "no-current", inProgress };
  }
  if (previousSec === 0) {
    return { kind: "no-previous", inProgress, totalSec };
  }
  return {
    kind: "delta",
    inProgress,
    deltaSec: weekFocusDeltaSec(daily, compareDaily, weekAnchorKey, todayKey),
  };
}

/** 날짜 키 → 순공시간(초). 달력이 날짜별 순공시간을 O(1)로 찾는다. */
export function buildDayFocusMap(daily: readonly DailyStudyStat[]): Map<string, number> {
  return new Map(daily.map((day) => [day.date, day.focusSec]));
}

/**
 * 주간 추이 차트 계산 (막대 차트가 그리기만 하도록 순수 TS로 분리)
 *
 * `GET /api/stats/period`는 기간 전체를 0으로 채워 주므로, 아직 오지 않은 요일도 focusSec 0으로
 * 내려온다. 그 0을 선으로 그리면 선이 미래까지 이어진다 — 이번 주·지난주 **둘 다** `todayKey` 이후
 * 날짜를 `null`로 둬 선/끝점에서 뺀다(미래 주로 이동해도 지난주 선이 미래 요일에 0으로 그려지지
 * 않게 하는 대칭 처리).
 */

/** 세로축 상한(시간). 8시간을 넘는 날은 상한에서 잘린다 — 달력 범례(8+)와 같은 단위다. */
export const MAX_CHART_HOURS = 8;

/** 월요일 시작 7칸. XAxis 눈금 순서이자 슬롯 인덱스다. */
const CHART_WEEKDAY_LABELS = MONDAY_FIRST_WEEKDAY_LABELS;

type ChartWeekday = (typeof CHART_WEEKDAY_LABELS)[number];

/** 요일별 순공 초(월~일). 미래 요일·기록 없는 요일은 `null`이다. */
export interface WeekTrendPoint {
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
