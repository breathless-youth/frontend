import type {
  MedalRank,
  RankingPeriod,
  RankingRecord,
  RankingUnseenResponse,
} from "@focusmakers/types";

import {
  WEEKDAY_LABELS,
  formatKstClock,
  weekdayIndexOfDateKey,
} from "@/features/records/recordsFormat";
import { todayKstDateKey } from "@/lib/dateKst";

import { PERIOD_LABEL } from "../model/board";
import { recordName, recordPeriodShort, recordValue } from "../model/format";

/**
 * 메달 그림에 겹쳐 그리는 자리
 *
 * 가운데가 가장 높은 순위다.
 */
export interface MedalStack {
  left: MedalRank | null;
  center: MedalRank;
  right: MedalRank | null;
}

export interface MedalRow {
  id: number;
  rank: MedalRank;
  name: string;
  detail: string;
  value: string;
}

export interface MedalCount {
  rank: MedalRank;
  count: number;
}

export interface MedalModalView {
  stack: MedalStack;
  /** 가운데 메달이 1위면 그 위에 왕관을 단다. */
  crown: boolean;
  eyebrow: string;
  title: string;
  /** 메달이 하나일 때의 기록 값이고, 여럿이면 null이다. */
  value: string | null;
  /** 메달이 여럿일 때 앞 3개 줄이다. */
  rows: MedalRow[];
  /** 메달이 4개 이상일 때만 있고, 0개인 순위는 뺀다. */
  counts: MedalCount[] | null;
  /** 목록 아래 `외 N개`의 N이다. */
  more: number;
  /** 본 것까지 더한 누적 메달 수. */
  total: number;
  /** 이번에 보이는 메달 수. */
  count: number;
  bestRank: MedalRank;
  /** 기간이나 기간 시작일이 다른 메달이 함께 떴는지. */
  mixed: boolean;
}

/**
 * 메달 위 기간 표기
 *
 * 일간은 하루를 가리키므로 요일을 붙이고, 주간·월간은 기록 목록과 같은 표기를 쓴다.
 */
export function medalPeriodLabel(record: { period: RankingPeriod; periodStart: string }): string {
  const short = recordPeriodShort(record);
  if (record.period !== "DAILY") {
    return short;
  }
  return `${short} (${WEEKDAY_LABELS[weekdayIndexOfDateKey(record.periodStart)]})`;
}

/**
 * 마감 시각 표기
 *
 * 서버 시각은 UTC라 KST 날짜로 바꿔 일간 기간 표기와 같은 모양으로 쓴다.
 * 마감은 늘 정시라 분은 빼고 시만 쓴다.
 */
export function closesAtLabel(closesAt: string): string {
  const dateKey = todayKstDateKey(new Date(closesAt));
  const hour = formatKstClock(closesAt).slice(0, 2);
  return `${medalPeriodLabel({ period: "DAILY", periodStart: dateKey })} ${hour}시`;
}

function countByRank(records: readonly RankingRecord[]): MedalCount[] {
  return ([1, 2, 3] as const)
    .map((rank) => ({ rank, count: records.filter((record) => record.rank === rank).length }))
    .filter((entry) => entry.count > 0);
}

/**
 * 메달 모달 모양
 *
 * 하나면 큰 메달과 기록 한 줄, 여럿이면 앞 3개 목록이고 4개 이상이면 순위별 개수와 나머지 개수를 더한다.
 * 그림은 앞 3개를 가운데가 가장 높은 순위가 되게, 둘째를 오른쪽, 셋째를 왼쪽에 둔다.
 * 4개 이상이면 앞 3개가 전체를 대표하지 못해 순위별 개수 줄처럼 딴 순위마다 메달 하나를 같은 자리에 둔다.
 * 기간이나 기간 시작일이 다르면 한 기간 표기로 묶을 수 없어 위 줄에 가장 늦은 마감 시각을 쓴다.
 * 그때 마감 시각이 모두 같으면 줄마다 기간 이름을, 다르면 기간 표기를 붙여 어느 판인지 가른다.
 */
export function medalModalView(unseen: RankingUnseenResponse): MedalModalView | null {
  const records = unseen.records;
  const [first] = records;
  if (first === undefined) {
    return null;
  }
  const front = records.slice(0, 3);
  const counts = records.length >= 4 ? countByRank(records) : null;
  const ranks =
    counts === null
      ? front.map((record) => record.rank).sort((a, b) => a - b)
      : counts.map((entry) => entry.rank);
  const center = ranks[0] ?? first.rank;
  const stack: MedalStack = { left: ranks[2] ?? null, center, right: ranks[1] ?? null };
  const bestRank = records.reduce<MedalRank>(
    (best, record) => (record.rank < best ? record.rank : best),
    first.rank,
  );
  const base = {
    stack,
    crown: center === 1,
    total: unseen.total,
    count: records.length,
    bestRank,
  };

  if (records.length === 1) {
    return {
      ...base,
      eyebrow: `${medalPeriodLabel(first)} · ${PERIOD_LABEL[first.period]} · ${recordName(first)}`,
      title: `${first.rank}위로 마감했어요`,
      value: recordValue(first),
      rows: [],
      counts: null,
      more: 0,
      mixed: false,
    };
  }

  const samePeriod = records.every(
    (record) => record.period === first.period && record.periodStart === first.periodStart,
  );
  const sameClose = records.every((record) => record.closesAt === first.closesAt);
  const latestClose = records.reduce(
    (latest, record) =>
      Date.parse(record.closesAt) > Date.parse(latest) ? record.closesAt : latest,
    first.closesAt,
  );
  const detailOf = (record: RankingRecord) => {
    const ranked = `${record.rank}위로 마감`;
    if (samePeriod) {
      return ranked;
    }
    return `${sameClose ? PERIOD_LABEL[record.period] : recordPeriodShort(record)} · ${ranked}`;
  };

  return {
    ...base,
    eyebrow: samePeriod
      ? `${medalPeriodLabel(first)} · ${PERIOD_LABEL[first.period]}`
      : `${closesAtLabel(latestClose)} 마감`,
    title: `메달 ${records.length}개를 땄어요`,
    value: null,
    rows: front.map((record) => ({
      id: record.id,
      rank: record.rank,
      name: recordName(record),
      detail: detailOf(record),
      value: recordValue(record),
    })),
    counts,
    more: Math.max(0, records.length - 3),
    mixed: !samePeriod,
  };
}
