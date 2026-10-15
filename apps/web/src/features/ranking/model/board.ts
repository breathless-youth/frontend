import type { RankingPeriod, RankingRecordType, RankingType, TimeSlot } from "@focusmakers/types";

import type { RankingBoardParams } from "@/lib/rankingApi";

export type BoardSelection =
  | { type: "FOCUS_TIME"; period: "DAILY" | "WEEKLY" | "MONTHLY" }
  | { type: "FOCUS_RATE"; period: "WEEKLY" | "MONTHLY" }
  | { type: "TIME_SLOT"; period: "DAILY" | "WEEKLY"; slot: TimeSlot | null }
  | { type: "TOTAL_TIME" | "TOTAL_DAYS" | "MAX_STREAK" };

export type BoardMode = "ranking" | "hall";
export type RankingBoardType = "FOCUS_TIME" | "FOCUS_RATE" | "TIME_SLOT";
export type HallBoardType = "TOTAL_TIME" | "TOTAL_DAYS" | "MAX_STREAK";
/** 같은 일수끼리 공동 순위인 판. */
export type DayBoardType = "TOTAL_DAYS" | "MAX_STREAK";

/**
 * 응답이 알려 주는 판
 *
 * 시간대 판은 서버가 고른 구간이 들어 있다.
 */
export interface BoardIdentity {
  type: RankingType;
  period: RankingPeriod | null;
  slot: TimeSlot | null;
}

export const RANKING_BOARD_TYPES: readonly RankingBoardType[] = [
  "FOCUS_TIME",
  "FOCUS_RATE",
  "TIME_SLOT",
];
export const HALL_BOARD_TYPES: readonly HallBoardType[] = [
  "TOTAL_TIME",
  "TOTAL_DAYS",
  "MAX_STREAK",
];

export const DEFAULT_RANKING_BOARD: BoardSelection = { type: "FOCUS_TIME", period: "WEEKLY" };
export const DEFAULT_HALL_BOARD: BoardSelection = { type: "TOTAL_TIME" };

/** 시간 판에서 메달을 받는 최소 값(초). */
export const MEDAL_MIN_SEC = 1800;

export const TYPE_LABEL: Record<RankingType, string> = {
  FOCUS_TIME: "순공",
  FOCUS_RATE: "집중률",
  TIME_SLOT: "시간대",
  TOTAL_TIME: "누적 시간",
  TOTAL_DAYS: "누적 일수",
  MAX_STREAK: "연속 공부",
};

export const PERIOD_LABEL: Record<RankingPeriod, string> = {
  DAILY: "일간",
  WEEKLY: "주간",
  MONTHLY: "월간",
};

export const SLOT_LABEL: Record<TimeSlot, string> = {
  DAWN: "새벽",
  MORNING: "오전",
  AFTERNOON: "오후",
  EVENING: "저녁",
  NIGHT: "심야",
};

export const SLOT_HOURS: Record<TimeSlot, string> = {
  DAWN: "4–7시",
  MORNING: "7–12시",
  AFTERNOON: "12–18시",
  EVENING: "18–22시",
  NIGHT: "22–4시",
};

/**
 * 구간 이름에 주격 조사를 붙인 꼴
 *
 * 받침이 없는 오후·심야는 `가`다.
 */
export const SLOT_SUBJECT: Record<TimeSlot, string> = {
  DAWN: "새벽이",
  MORNING: "오전이",
  AFTERNOON: "오후가",
  EVENING: "저녁이",
  NIGHT: "심야가",
};

const PERIODS: Record<RankingType, readonly RankingPeriod[]> = {
  FOCUS_TIME: ["DAILY", "WEEKLY", "MONTHLY"],
  FOCUS_RATE: ["WEEKLY", "MONTHLY"],
  TIME_SLOT: ["DAILY", "WEEKLY"],
  TOTAL_TIME: [],
  TOTAL_DAYS: [],
  MAX_STREAK: [],
};

export function periodsOf(type: RankingType): readonly RankingPeriod[] {
  return PERIODS[type];
}

export function isHallType(type: RankingType): type is HallBoardType {
  return type === "TOTAL_TIME" || type === "TOTAL_DAYS" || type === "MAX_STREAK";
}

export function isDayType(type: RankingType): type is DayBoardType {
  return type === "TOTAL_DAYS" || type === "MAX_STREAK";
}

/**
 * 값이 초 단위 공부 시간인 판
 *
 * 메달 30분 조건과 보간이 여기에만 걸린다.
 */
export function isTimeType(type: RankingType): boolean {
  return type === "FOCUS_TIME" || type === "TIME_SLOT";
}

export function modeOf(selection: BoardSelection): BoardMode {
  return isHallType(selection.type) ? "hall" : "ranking";
}

export function isLiveBoard(selection: BoardSelection): boolean {
  return isTimeType(selection.type);
}

export function periodOf(selection: BoardSelection): RankingPeriod | null {
  return "period" in selection ? selection.period : null;
}

export function slotOf(selection: BoardSelection): TimeSlot | null {
  return selection.type === "TIME_SLOT" ? selection.slot : null;
}

/**
 * 종목 바꾸기
 *
 * 종목을 바꾼다.
 * 지금 기간이 그 종목에 없으면 주간으로 바꾸고, 시간대는 지금 구간으로 연다.
 */
export function selectType(current: BoardSelection, type: RankingType): BoardSelection {
  const period = periodOf(current);
  switch (type) {
    case "FOCUS_TIME":
      return { type, period: period ?? "WEEKLY" };
    case "FOCUS_RATE":
      return { type, period: period === "MONTHLY" ? "MONTHLY" : "WEEKLY" };
    case "TIME_SLOT":
      return { type, period: period === "DAILY" ? "DAILY" : "WEEKLY", slot: null };
    default:
      return { type };
  }
}

export function selectPeriod(current: BoardSelection, period: RankingPeriod): BoardSelection {
  if (!periodsOf(current.type).includes(period)) {
    return current;
  }
  switch (current.type) {
    case "FOCUS_TIME":
      return { type: "FOCUS_TIME", period };
    case "FOCUS_RATE":
      return { type: "FOCUS_RATE", period: period === "MONTHLY" ? "MONTHLY" : "WEEKLY" };
    case "TIME_SLOT":
      return {
        type: "TIME_SLOT",
        period: period === "DAILY" ? "DAILY" : "WEEKLY",
        slot: current.slot,
      };
    default:
      return current;
  }
}

export function selectSlot(current: BoardSelection, slot: TimeSlot): BoardSelection {
  return current.type === "TIME_SLOT" ? { ...current, slot } : current;
}

export function sameSelection(a: BoardSelection, b: BoardSelection): boolean {
  return a.type === b.type && periodOf(a) === periodOf(b) && slotOf(a) === slotOf(b);
}

/**
 * 지금 구간 고르기
 *
 * KST 시각으로 지금 구간을 고른다.
 * 0~4시는 전날 심야다.
 */
export function currentSlot(nowMs: number): TimeSlot {
  const hour = new Date(nowMs + 9 * 3_600_000).getUTCHours();
  if (hour >= 4 && hour < 7) return "DAWN";
  if (hour >= 7 && hour < 12) return "MORNING";
  if (hour >= 12 && hour < 18) return "AFTERNOON";
  if (hour >= 18 && hour < 22) return "EVENING";
  return "NIGHT";
}

/**
 * 지금 구간이 아닌 시간대 판
 *
 * 지금 공부한 시간은 지금 구간에만 들어가므로 이런 판에서는 지금 시작해도 순위가 생기지 않는다.
 */
export function isOffSlot(board: BoardIdentity, nowMs: number): boolean {
  return board.type === "TIME_SLOT" && board.slot !== null && board.slot !== currentSlot(nowMs);
}

/**
 * 실시간 비교 기준을 가르는 키
 *
 * 지금 구간을 쓰는 시간대 판은 서버가 고른 구간을 넣어 구간이 바뀌면 새 판으로 본다.
 */
export function boardKeyOf(selection: BoardSelection, resolvedSlot: TimeSlot | null): string {
  const slot = selection.type === "TIME_SLOT" ? (selection.slot ?? resolvedSlot) : null;
  return `${selection.type}:${periodOf(selection) ?? "-"}:${slot ?? "-"}`;
}

/** 기록 항목·최고 기록·가장 가까운 판이 가리키는 지금 판. */
export function selectionOfRecord(record: {
  type: RankingRecordType;
  period: RankingPeriod;
  slot: TimeSlot | null;
}): BoardSelection {
  switch (record.type) {
    case "FOCUS_TIME":
      return { type: "FOCUS_TIME", period: record.period };
    case "FOCUS_RATE":
      return { type: "FOCUS_RATE", period: record.period === "MONTHLY" ? "MONTHLY" : "WEEKLY" };
    case "TIME_SLOT":
      return {
        type: "TIME_SLOT",
        period: record.period === "DAILY" ? "DAILY" : "WEEKLY",
        slot: record.slot,
      };
  }
}

/**
 * 판 선택의 요청 파라미터
 *
 * 판 선택을 요청 파라미터로 바꾼다.
 * 지금 구간이면 slot을 빼서 서버가 고르게 한다.
 */
export function boardParams(selection: BoardSelection, offset: 0 | -1 = 0): RankingBoardParams {
  const period = periodOf(selection);
  const slot = slotOf(selection);
  return {
    type: selection.type,
    ...(period === null ? {} : { period }),
    ...(slot === null ? {} : { slot }),
    ...(offset === -1 ? { offset } : {}),
  };
}
