import type { RankingPeriod, RankingRecordType, RankingType, TimeSlot } from "@focusmakers/types";

import { addDaysToDateKey, dayOfDateKey, monthOfDateKey } from "@/features/records/recordsFormat";

import { PERIOD_LABEL, SLOT_LABEL, type BoardIdentity } from "./board";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatRank(rank: number): string {
  return rank.toLocaleString("ko-KR");
}

const pad2 = (value: number) => String(value).padStart(2, "0");

/**
 * 시간 판 값
 *
 * 시는 자르지 않는다(`41:20:00`).
 */
export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  return `${hours}:${pad2(minutes)}:${pad2(sec % 60)}`;
}

/**
 * 누적 시간 값
 *
 * 쌓인 양이라 분을 내린다.
 * 1시간 미만은 분만 쓰고 최소 1분이다.
 * 1시간 이상은 시간에 쉼표를 넣고, 딱 맞는 시간이면 분을 뺀다(`4,812시간 30분`, `419시간`).
 */
function formatTotalTime(sec: number): string {
  const totalMinutes = Math.max(1, Math.floor(sec / 60));
  if (totalMinutes < 60) {
    return `${totalMinutes}분`;
  }
  const hours = `${formatRank(Math.floor(totalMinutes / 60))}시간`;
  const minutes = totalMinutes % 60;
  return minutes === 0 ? hours : `${hours} ${minutes}분`;
}

export function formatValue(type: RankingType, value: number): string {
  switch (type) {
    case "FOCUS_TIME":
    case "TIME_SLOT":
      return formatClock(value);
    case "TOTAL_TIME":
      return formatTotalTime(value);
    case "FOCUS_RATE":
      return `${value.toFixed(1)}%`;
    default:
      return `${formatRank(value)}일`;
  }
}

/**
 * 시간 차이
 *
 * 1시간 미만은 분을 올리고 최소 1분이다.
 */
export function formatGapDuration(sec: number): string {
  const totalMinutes = Math.max(1, Math.ceil(sec / 60));
  if (totalMinutes < 60) {
    return `${totalMinutes}분`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

/**
 * 단위별 차이
 *
 * 일수 판은 같은 일수끼리 공동 순위이고 바로 위·아래는 일수가 다른 사람이라 차이가 0일로 오지 않는다.
 * 그래도 0이 오면 `0일`로 적지 않도록 일수 차이를 최소 1일로 막아 둔다.
 */
export function formatGap(type: RankingType, gap: number): string {
  switch (type) {
    case "FOCUS_RATE":
      return `${gap.toFixed(1)}%`;
    case "TOTAL_DAYS":
    case "MAX_STREAK":
      return `${formatRank(Math.max(1, gap))}일`;
    default:
      return formatGapDuration(gap);
  }
}

/** 기기 시계 대신 응답의 계산 시각에 받은 뒤 지난 시간을 더한 서버 쪽 지금. */
export function serverNowMs(asOf: string, updatedAt: number, now: number): number {
  return Date.parse(asOf) + Math.max(0, now - updatedAt);
}

export function formatDeadline(
  board: BoardIdentity & { closesAt: string | null },
  serverNow: number,
): string | null {
  if (board.period === null || board.closesAt === null) {
    return null;
  }
  if (board.period === "DAILY") {
    return board.slot === "NIGHT" ? "04시 마감" : "00시 마감";
  }
  const remain = Math.max(0, Date.parse(board.closesAt) - serverNow);
  const days = Math.floor(remain / DAY_MS);
  const hours = Math.floor((remain % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((remain % HOUR_MS) / MINUTE_MS);
  if (days > 0) {
    return hours === 0 ? `마감 ${days}일` : `마감 ${days}일 ${hours}시간`;
  }
  if (hours > 0) {
    return minutes === 0 ? `마감 ${hours}시간` : `마감 ${hours}시간 ${minutes}분`;
  }
  const roundedMinutes = Math.max(1, Math.ceil(remain / MINUTE_MS));
  return roundedMinutes < 60 ? `마감 ${roundedMinutes}분` : "마감 1시간";
}

export type ProgressType = "FOCUS_TIME" | "TIME_SLOT" | "FOCUS_RATE" | "TOTAL_TIME" | "TOTAL_DAYS";

/**
 * 진행바가 최소 폭이 되는 차이
 *
 * 이보다 멀면 6%로 둔다.
 */
const PROGRESS_WINDOW: Record<ProgressType, number> = {
  FOCUS_TIME: 2400,
  TIME_SLOT: 2400,
  FOCUS_RATE: 2,
  TOTAL_TIME: 36000,
  TOTAL_DAYS: 10,
};

export function progressPercent(type: ProgressType, gap: number): number {
  if (gap <= 0) {
    return 100;
  }
  return Math.max(6, Math.round(100 * (1 - gap / PROGRESS_WINDOW[type])));
}

export function formatMonthDay(dateKey: string): string {
  return `${monthOfDateKey(dateKey).month}월 ${dayOfDateKey(dateKey)}일`;
}

/**
 * 주 이름 `N월 N주`
 *
 * 그 주 목요일이 속한 달의 몇째 목요일인지로 센다.
 * 달이 걸친 주는 날이 더 많은 쪽 달로 들어가 9월 28일에 시작한 주가 `10월 1주`가 된다.
 */
export function weekOfMonthLabel(mondayKey: string): string {
  const thursday = addDaysToDateKey(mondayKey, 3);
  return `${monthOfDateKey(thursday).month}월 ${Math.ceil(dayOfDateKey(thursday) / 7)}주`;
}

/**
 * 기록을 묶을 달(`yyyy-MM`)
 *
 * 주간은 주 이름과 같은 달이다.
 */
export function recordMonthKey(record: { period: RankingPeriod; periodStart: string }): string {
  const dateKey =
    record.period === "WEEKLY" ? addDaysToDateKey(record.periodStart, 3) : record.periodStart;
  return dateKey.slice(0, 7);
}

export function recordName(record: { type: RankingRecordType; slot: TimeSlot | null }): string {
  if (record.type === "TIME_SLOT") {
    return record.slot === null ? "시간대" : `${SLOT_LABEL[record.slot]} 구간`;
  }
  return record.type === "FOCUS_RATE" ? "집중률" : "순공";
}

export function recordPeriodShort(record: { period: RankingPeriod; periodStart: string }): string {
  switch (record.period) {
    case "DAILY":
      return formatMonthDay(record.periodStart);
    case "WEEKLY":
      return weekOfMonthLabel(record.periodStart);
    case "MONTHLY":
      return `${monthOfDateKey(record.periodStart).month}월`;
  }
}

export function recordPeriod(record: { period: RankingPeriod; periodStart: string }): string {
  return `${PERIOD_LABEL[record.period]} · ${recordPeriodShort(record)}`;
}

export function recordValue(record: { type: RankingRecordType; value: number }): string {
  return record.type === "FOCUS_RATE" ? `${record.value.toFixed(1)}%` : formatClock(record.value);
}
