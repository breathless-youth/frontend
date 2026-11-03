import type { RankingPeriod } from "@focusmakers/types";

import i18n from "@/lib/i18n";

import { periodLabel, slotHours, slotLabel, typeLabel, type BoardIdentity } from "./board";

const PERIOD_WORD_KEYS = {
  DAILY: "ranking:periodWord.daily",
  WEEKLY: "ranking:periodWord.weekly",
  MONTHLY: "ranking:periodWord.monthly",
} as const satisfies Record<RankingPeriod, string>;

export function periodWord(period: RankingPeriod): string {
  return i18n.t(PERIOD_WORD_KEYS[period]);
}

export function slotName(board: Pick<BoardIdentity, "slot">): string {
  return board.slot === null
    ? i18n.t("ranking:slot.unknown")
    : i18n.t("ranking:slot.name", { slot: slotLabel(board.slot) });
}

export function podiumTitle(board: BoardIdentity): string {
  switch (board.type) {
    case "FOCUS_TIME":
      return i18n.t("ranking:podium.titleTop3", { name: periodWord(board.period ?? "DAILY") });
    case "FOCUS_RATE":
      return i18n.t("ranking:podium.titleFocusRate");
    case "TIME_SLOT":
      return i18n.t("ranking:podium.titleTop3", { name: slotName(board) });
    case "MAX_STREAK":
      return i18n.t("ranking:podium.titleMaxStreak");
    default:
      return i18n.t("ranking:podium.titleHall");
  }
}

/**
 * 시상대 기준 툴팁
 *
 * 집중률은 참가 기준, 시간대는 어느 시각의 순공으로 겨루는지 알려 준다.
 * 시간대는 시상대 제목에 구간 이름이 있어 시각만 쓴다.
 * 나머지 판은 종목 칩과 기간 칸만으로 기준이 드러나 툴팁을 두지 않는다.
 */
export function podiumTooltip(board: BoardIdentity): string | null {
  switch (board.type) {
    case "FOCUS_RATE":
      return board.period === "MONTHLY"
        ? i18n.t("ranking:podium.tooltipRateMonthly")
        : i18n.t("ranking:podium.tooltipRateWeekly");
    case "TIME_SLOT":
      return board.slot === null
        ? null
        : i18n.t("ranking:podium.tooltipSlot", {
            period: periodWord(board.period ?? "DAILY"),
            hours: slotHours(board.slot),
          });
    default:
      return null;
  }
}

export function cardTitle(board: BoardIdentity): string {
  switch (board.type) {
    case "FOCUS_TIME":
    case "FOCUS_RATE":
      return `${typeLabel(board.type)} · ${periodLabel(board.period ?? "DAILY")}`;
    case "TIME_SLOT":
      return `${slotName(board)} · ${periodLabel(board.period ?? "DAILY")}`;
    case "MAX_STREAK":
      return i18n.t("ranking:card.maxStreakTitle");
    default:
      return typeLabel(board.type);
  }
}

/** 지금 구간이 아닌 시간대 판에서 순위 대신 쓰는 큰 문구. */
export function offSlotHeadline(board: BoardIdentity): string {
  return i18n.t("ranking:offSlot.headline", {
    slot: board.slot === null ? i18n.t("ranking:slot.unknown") : slotLabel(board.slot),
  });
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
  return i18n.t("ranking:offSlot.notice", { slot: slotLabel(board.slot) });
}

const PREVIOUS_RESULT_KEYS = {
  DAILY: "ranking:previousResult.daily",
  WEEKLY: "ranking:previousResult.weekly",
  MONTHLY: "ranking:previousResult.monthly",
} as const satisfies Record<RankingPeriod, string>;

export function previousResultLabel(period: RankingPeriod): string {
  return i18n.t(PREVIOUS_RESULT_KEYS[period]);
}
