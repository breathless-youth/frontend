import {
  addDaysToDateKey,
  dayOfDateKey,
  dayTitleWithWeekday,
  WEEKDAY_LABELS,
  weekdayIndexOfDateKey,
} from "@/features/records/recordsFormat";

/**
 * 홈 날짜 줄에 놓는 날 수
 *
 * 오늘을 포함한다.
 */
export const HOME_DATE_RANGE_DAYS = 30;

/**
 * 홈 날짜 줄의 날짜 키
 *
 * 오래된 날부터 오늘까지 늘어놓아 마지막이 오늘이다.
 * 미래 날짜는 고를 수 없어 넣지 않는다.
 */
export function homeDateKeys(todayKey: string): string[] {
  return Array.from({ length: HOME_DATE_RANGE_DAYS }, (_, index) =>
    addDaysToDateKey(todayKey, index - (HOME_DATE_RANGE_DAYS - 1)),
  );
}

/** 날짜 칩 글자 `26일 (월)`. */
export function homeDateChipLabel(dateKey: string): string {
  return `${dayOfDateKey(dateKey)}일 (${WEEKDAY_LABELS[weekdayIndexOfDateKey(dateKey)]})`;
}

/** 날짜 칩을 읽어 주는 이름 `10월 26일 월요일, 오늘`. */
export function homeDateAccessibilityLabel(dateKey: string, todayKey: string): string {
  return `${dayTitleWithWeekday(dateKey)}${dateKey === todayKey ? ", 오늘" : ""}`;
}
