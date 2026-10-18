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
      return `${periodWord(board.period ?? "WEEKLY")} TOP 3`;
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

export function podiumCaption(board: BoardIdentity): string | null {
  switch (board.type) {
    case "FOCUS_RATE":
      return board.period === "MONTHLY" ? "순공 30시간 이상 참가" : "순공 10시간 이상 참가";
    case "TIME_SLOT":
      return board.slot === null
        ? null
        : `${periodWord(board.period ?? "DAILY")} ${SLOT_HOURS[board.slot]}`;
    case "TOTAL_TIME":
      return "누적 순공";
    case "TOTAL_DAYS":
      return "공부한 날";
    case "MAX_STREAK":
      return "최대 연속 공부 기준";
    default:
      return null;
  }
}

export function cardTitle(board: BoardIdentity): string {
  switch (board.type) {
    case "FOCUS_TIME":
    case "FOCUS_RATE":
      return `${TYPE_LABEL[board.type]} · ${PERIOD_LABEL[board.period ?? "WEEKLY"]}`;
    case "TIME_SLOT":
      return `${slotName(board)} · ${PERIOD_LABEL[board.period ?? "DAILY"]}`;
    case "MAX_STREAK":
      return "최대 연속 공부";
    default:
      return TYPE_LABEL[board.type];
  }
}

export function competitionLine(board: BoardIdentity): string {
  switch (board.type) {
    case "FOCUS_TIME":
      return `${periodWord(board.period ?? "WEEKLY")} 순공으로 겨루고 있어요`;
    case "TIME_SLOT":
      return `${periodWord(board.period ?? "DAILY")} ${slotName(board)}으로 겨루고 있어요`;
    case "FOCUS_RATE":
      return `${periodWord(board.period ?? "WEEKLY")} 집중률로 겨루고 있어요`;
    case "TOTAL_TIME":
      return "누적 순공으로 겨루고 있어요";
    case "TOTAL_DAYS":
      return "공부한 날로 겨루고 있어요";
    case "MAX_STREAK":
      return "최대 연속 공부로 겨루고 있어요";
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
export function offSlotNotice(board: BoardIdentity): string {
  if (board.slot === null) {
    return "";
  }
  return `${SLOT_LABEL[board.slot]} ${SLOT_HOURS[board.slot]}에 공부한 시간만 이 순위에 들어가요`;
}

const RESET_TIME: Record<RankingPeriod, string> = {
  DAILY: "00시에 일간",
  WEEKLY: "월요일 00시에 주간",
  MONTHLY: "1일 00시에 월간",
};

export function resetNotice(board: BoardIdentity): string {
  const period = board.period ?? "DAILY";
  if (board.type === "TIME_SLOT") {
    return `${periodWord(period)} ${slotName(board)} 랭킹이 새로 시작됐어요`;
  }
  return `${RESET_TIME[period]} 랭킹이 새로 시작됐어요`;
}

const PREVIOUS_RESULT: Record<RankingPeriod, string> = {
  DAILY: "어제 최종 결과",
  WEEKLY: "지난주 최종 결과",
  MONTHLY: "지난달 최종 결과",
};

export function previousResultLabel(period: RankingPeriod): string {
  return PREVIOUS_RESULT[period];
}
