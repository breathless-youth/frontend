import type {
  RankingPeriod,
  RankingSessionGainsResponse,
  RankingType,
  TimeSlot,
} from "@focusmakers/types";

import { isHallType, PERIOD_LABEL, TYPE_LABEL } from "../model/board";
import { formatRank, recordName } from "../model/format";

/** 결과 카드에 보이는 칩의 최대 수. */
export const MAX_GAIN_CHIPS = 3;

export interface GainChip {
  /** 종목과 구간으로 만든 판 이름표이고 같은 판을 합치는 데 쓴다. */
  key: string;
  label: string;
  delta: number;
}

export interface GainCardView {
  before: number;
  after: number;
  delta: number;
  chips: GainChip[];
}

/**
 * 칩 이름
 *
 * 순공·집중률은 종목 이름, 시간대는 구간 이름, 명예의 전당은 판 이름이다.
 * 기록 화면과 같은 이름이 나오도록 명예의 전당이 아닌 판은 기록 이름을 그대로 쓴다.
 * 순공만 기간을 붙인다.
 * 기간 없는 `순공`은 바로 위 `주간 순공` 큰 줄과 같은 판처럼 읽혀 숫자가 서로 어긋나 보인다.
 */
export function gainChipLabel(gain: {
  type: RankingType;
  period: RankingPeriod | null;
  slot: TimeSlot | null;
}): string {
  if (isHallType(gain.type)) {
    return TYPE_LABEL[gain.type];
  }
  const name = recordName({ type: gain.type, slot: gain.slot });
  return gain.type === "FOCUS_TIME" && gain.period !== null
    ? `${PERIOD_LABEL[gain.period]} ${name}`
    : name;
}

/**
 * 결과 랭킹 카드 모양
 *
 * 주간 순공이 오르지 않았으면 다른 판이 올랐어도 카드를 숨긴다.
 * 칩은 서버 순서를 지키고, 같은 판(종목·구간)은 더 많이 오른 값 하나만 그 판이 처음 나온 자리에 쓴다.
 * 순공 칩은 이름에 기간이 붙으므로 이름도 그 값의 기간으로 바꾼다.
 * 오르지 않은 판은 `▲0`이 되어 뜻이 없으므로 버린다.
 */
export function gainCardView(response: RankingSessionGainsResponse): GainCardView | null {
  const weekly = response.weekly;
  if (weekly === null || weekly.delta <= 0) {
    return null;
  }
  const chips: GainChip[] = [];
  for (const gain of response.others) {
    if (gain.delta <= 0) {
      continue;
    }
    const key = `${gain.type}:${gain.slot ?? "-"}`;
    const index = chips.findIndex((chip) => chip.key === key);
    const kept = chips[index];
    if (kept === undefined) {
      chips.push({ key, label: gainChipLabel(gain), delta: gain.delta });
    } else if (gain.delta > kept.delta) {
      chips[index] = { key, label: gainChipLabel(gain), delta: gain.delta };
    }
  }
  return {
    before: weekly.before,
    after: weekly.after,
    delta: weekly.delta,
    chips: chips.slice(0, MAX_GAIN_CHIPS),
  };
}

export function formatRise(delta: number): string {
  return `▲${formatRank(delta)}`;
}

/**
 * 화면 낭독기용 오른 계단 수
 *
 * ▲는 기호 이름으로 읽혀 뜻이 전해지지 않아 보이는 표기는 가리고 이 문장을 읽힌다.
 */
export function formatRiseSpoken(delta: number): string {
  return `${formatRank(delta)}계단 올랐어요`;
}
