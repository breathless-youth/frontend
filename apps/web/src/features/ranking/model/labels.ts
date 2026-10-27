import type { RankingPeriod } from "@focusmakers/types";

import { PERIOD_LABEL, SLOT_HOURS, SLOT_LABEL, TYPE_LABEL, type BoardIdentity } from "./board";

const PERIOD_WORD: Record<RankingPeriod, string> = {
  DAILY: "오늘",
  WEEKLY: "이번 주",
  MONTHLY: "이번 달",
};

export function periodWord(period: RankingPeriod): string {
  return PERIOD_WORD[period];
}

export function slotName(board: BoardIdentity): string {
  return board.slot === null ? "시간대" : `${SLOT_LABEL[board.slot]} 구간`;
}

export function podiumTitle(board: BoardIdentity): string {
  switch (board.type) {
    case "FOCUS_TIME":
      return `${periodWord(board.period ?? "DAILY")} TOP 3`;
    case "FOCUS_RATE":
      return "집중률 TOP 3";
    case "TIME_SLOT":
      return `${slotName(board)} TOP 3`;
    case "MAX_STREAK":
      return "연속 공부 TOP 3";
    default:
      return "명예의 전당 TOP 3";
  }
}

/**
 * 시상대 기준 툴팁
 *
 * 집중률은 참가 기준, 시간대는 어느 시각의 순공으로 겨루는지 알려 준다.
 * 나머지 판은 종목 칩과 기간 칸만으로 기준이 드러나 툴팁을 두지 않는다.
 */
export function podiumTooltip(board: BoardIdentity): string | null {
  switch (board.type) {
    case "FOCUS_RATE":
      return board.period === "MONTHLY"
        ? "이번 달 순공 30시간 이상 기록하면 랭킹에 진입할 수 있어요"
        : "이번 주에 순공 10시간 이상 기록하면 랭킹에 진입할 수 있어요";
    case "TIME_SLOT":
      return board.slot === null
        ? null
        : `${periodWord(board.period ?? "DAILY")} ${SLOT_LABEL[board.slot]} ${SLOT_HOURS[board.slot]} 순공시간 기준`;
    default:
      return null;
  }
}

export function cardTitle(board: BoardIdentity): string {
  switch (board.type) {
    case "FOCUS_TIME":
    case "FOCUS_RATE":
      return `${TYPE_LABEL[board.type]} · ${PERIOD_LABEL[board.period ?? "DAILY"]}`;
    case "TIME_SLOT":
      return `${slotName(board)} · ${PERIOD_LABEL[board.period ?? "DAILY"]}`;
    case "MAX_STREAK":
      return "최대 연속 공부";
    default:
      return TYPE_LABEL[board.type];
  }
}

/** 지금 구간이 아닌 시간대 판에서 순위 대신 쓰는 큰 문구. */
export function offSlotHeadline(board: BoardIdentity): string {
  return `${slotName(board)}에 공부하면 랭킹 진입`;
}

/**
 * 지금 구간이 아닌 시간대 판의 안내
 *
 * 지금 공부해도 이 판에 들어가지 않아 이 판에 들어가는 시각을 알린다.
 */
export function offSlotNotice(board: BoardIdentity): string | null {
  if (board.slot === null) {
    return null;
  }
  return `${SLOT_LABEL[board.slot]} ${SLOT_HOURS[board.slot]}에 공부한 시간만 이 순위에 들어가요`;
}

const PREVIOUS_RESULT: Record<RankingPeriod, string> = {
  DAILY: "어제 최종 결과",
  WEEKLY: "지난주 최종 결과",
  MONTHLY: "지난달 최종 결과",
};

export function previousResultLabel(period: RankingPeriod): string {
  return PREVIOUS_RESULT[period];
}
