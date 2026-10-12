/**
 * 랭킹 API 응답 타입
 *
 * 공유 타입은 백엔드 명세에 있는 모양만 두므로 dev 백엔드 Swagger(`/v3/api-docs`)와 대조해 맞췄다(2026-10-11).
 * 랭킹판과 기록 API 모두 Swagger 기준이고, dev에 배포된 일수 판 시상대 묶음(`podiumGroups`)도 여기에 든다.
 * 홈, 안 본 기록, 본 것 표시, 세션 뒤 오른 순위는 개발 서버 Swagger와 대조했다(2026-10-12).
 * 시각은 UTC ISO-8601, 날짜는 KST `yyyy-MM-dd`다.
 * 값과 차이의 단위는 시간 판이 초, 일수 판이 일, 집중률이 %(소수 1자리)다.
 */

export const RANKING_TYPES = [
  "FOCUS_TIME",
  "FOCUS_RATE",
  "TIME_SLOT",
  "TOTAL_TIME",
  "TOTAL_DAYS",
  "MAX_STREAK",
] as const;
export type RankingType = (typeof RANKING_TYPES)[number];

export const RANKING_PERIODS = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type RankingPeriod = (typeof RANKING_PERIODS)[number];

export const TIME_SLOTS = ["DAWN", "MORNING", "AFTERNOON", "EVENING", "NIGHT"] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number];

/**
 * 마감 기록이 남는 판.
 * 명예의 전당은 마감이 없어 기록이 없다.
 */
export type RankingRecordType = "FOCUS_TIME" | "FOCUS_RATE" | "TIME_SLOT";

export type MedalRank = 1 | 2 | 3;

/** 시상대와 내 주변 목록의 한 줄. */
export interface RankingEntry {
  rank: number;
  nickname: string;
  value: number;
  /**
   * 지금 집중 중인지.
   * 순공·시간대 판에서만 켜진다.
   */
  focusing: boolean;
  me: boolean;
}

export interface RankingMe {
  rank: number;
  value: number;
  focusing: boolean;
  topPercent: number;
}

/** 바로 위나 바로 아래 사람과의 차이. */
export interface RankingNeighbor {
  nickname: string;
  gap: number;
  focusing: boolean;
  /**
   * 집중률 판의 바로 위에만 온다.
   * 총공부 시간이 같을 때 순공을 몇 초 더 하면 넘는지다.
   */
  catchUpFocusSec?: number | null;
}

export interface RankingEligibility {
  eligible: boolean;
  focusSec: number;
  requiredFocusSec: number;
  focusRate: number;
  expectedRank: number | null;
  /**
   * 지금 집중률로 참가하면 받을 상위 %이고, `me.topPercent`처럼 나를 분모에 넣어 센다.
   * 참가 조건을 채웠으면 `expectedRank`와 함께 null이고, 이 필드가 배포되기 전 응답에는 없다.
   */
  expectedTopPercent?: number | null;
}

export interface RankingNextTier {
  percent: number;
  remaining: number;
  etaDays: number | null;
}

export interface RankingStreak {
  maxDays: number;
  maxStart: string | null;
  maxEnd: string | null;
  currentDays: number;
  currentIsBest: boolean;
  nextRankIfContinue: number | null;
}

/**
 * 일수 판의 같은 일수 묶음 한 줄
 *
 * 누적 일수·연속 공부 판은 일수가 같으면 같은 순위라 `rank`는 묶음의 공동 순위다.
 * `nickname`은 묶음의 대표로, 내가 묶음에 있으면 나이고 없으면 그 일수에 먼저 도달한 사람이다.
 * `othersCount`는 대표를 뺀 나머지 인원이다.
 * `myOrder`는 내 묶음에만 오고, 같은 일수 중 몇 번째로 도달했는지다.
 */
export interface RankingDayGroup {
  days: number;
  rank: number;
  nickname: string;
  othersCount: number;
  achievedDate: string;
  me: boolean;
  myOrder: number | null;
}

export interface RankingGoalExample {
  percent: number;
  value: number;
}

/** `GET /api/rankings/board` */
export interface RankingBoardResponse {
  type: RankingType;
  /** 명예의 전당은 null이다. */
  period: RankingPeriod | null;
  /** 시간대 판만 값이 있고, 요청에서 빼면 서버가 고른 지금 구간이 온다. */
  slot: TimeSlot | null;
  periodStart: string | null;
  closesAt: string | null;
  asOf: string;
  /** 일수 판은 빈 배열이고 시상대는 `podiumGroups`가 맡는다. */
  podium: RankingEntry[];
  me: RankingMe | null;
  /** 일수 판은 빈 배열이고 내 주변은 `aroundGroups`가 맡는다. */
  around: RankingEntry[];
  above: RankingNeighbor | null;
  below: RankingNeighbor | null;
  startNowRank: number | null;
  eligibility?: RankingEligibility | null;
  nextTier?: RankingNextTier | null;
  streak?: RankingStreak | null;
  /**
   * 일수 판의 내 주변 묶음
   *
   * 내 묶음 앞 2개, 내 묶음, 뒤 2개이고 내 순위가 없으면 빈 배열이다.
   * 일수 판에만 오므로 다른 판에서는 비어 있다.
   */
  aroundGroups?: RankingDayGroup[] | null;
  /**
   * 일수 판의 시상대 묶음
   *
   * 일수 판만 보내고, 일수가 많은 순으로 최대 3묶음이며 내 참가와 상관없이 온다.
   */
  podiumGroups?: RankingDayGroup[] | null;
  goalExamples?: RankingGoalExample[] | null;
}

/** 마감 때 3위 안에 들어 남은 기록 한 건. */
export interface RankingRecord {
  id: number;
  type: RankingRecordType;
  period: RankingPeriod;
  slot: TimeSlot | null;
  periodStart: string;
  rank: MedalRank;
  value: number;
  closesAt: string;
}

export interface RankingBest {
  rank: number;
  type: RankingRecordType;
  period: RankingPeriod;
  slot: TimeSlot | null;
  periodStart: string;
}

export interface RankingClosest {
  type: "FOCUS_TIME" | "TIME_SLOT";
  period: RankingPeriod;
  slot: TimeSlot | null;
  gap: number;
}

/** `GET /api/rankings/records/summary` */
export interface RankingRecordsSummary {
  total: number;
  firstCount: number;
  secondCount: number;
  thirdCount: number;
  recent: RankingRecord[];
  /** `total`이 0일 때만 온다. */
  best: RankingBest | null;
  /** `total`이 0일 때만 온다. */
  closest: RankingClosest | null;
}

/** `GET /api/rankings/records` */
export interface RankingRecordsPage {
  items: RankingRecord[];
  nextCursor: string | null;
}

/** 홈 한 줄 카드의 바로 위 사람. */
export interface RankingHomeNeighbor {
  nickname: string;
  /** 순공 차이(초). */
  gap: number;
}

/** 이번 주 순공 판의 내 자리. */
export interface RankingHomeCard {
  rank: number;
  /** 순공(초). */
  value: number;
  /** 1위면 null이다. */
  above: RankingHomeNeighbor | null;
}

/** `since` 뒤로 나를 추월한 사람 하나. */
export interface RankingOvertaker {
  nickname: string;
  /** 지금 나와의 순공 차이(초). */
  gap: number;
  /** `since` 뒤 처음 공부를 시작한 시각이고, 그때 공부 중이었으면 `since`다. */
  studiedFrom: string;
  /** `since` 뒤로 쌓은 순공(초). */
  studiedFocusSec: number;
}

/** 자리를 비운 사이 바뀐 이번 주 순공 순위. */
export interface RankingOvertaken {
  fromRank: number;
  toRank: number;
  /** `since`에 내 뒤였거나 참가 전이었다가 지금 내 앞인 사람 수. */
  count: number;
  /** 그중 지금 나와 가장 가까운 사람부터 최대 2명. */
  nearest: RankingOvertaker[];
}

/**
 * `GET /api/rankings/home`
 *
 * `card`는 이번 주 기록이 없으면 null이다.
 * `overtaken`은 `since`가 없거나, 이번 주 월요일 0시(KST) 전이거나 미래이거나, `since`에 내 순위가 없었거나, 순위가 내려가지 않았으면 null이다.
 */
export interface RankingHomeResponse {
  card: RankingHomeCard | null;
  overtaken: RankingOvertaken | null;
}

/**
 * `GET /api/rankings/records/unseen`
 *
 * `records`는 순위, 일·주·월, 순공·집중률·시간대 순이고 최대 100개다.
 */
export interface RankingUnseenResponse {
  /** 본 것까지 더한 누적 메달 수. */
  total: number;
  records: RankingRecord[];
}

/**
 * `POST /api/rankings/records/seen` 본문
 *
 * `ids`는 최대 100개다.
 */
export interface RankingRecordSeenRequest {
  ids: number[];
}

/**
 * 판 하나의 순위 변화
 *
 * `before`는 이번 제출을 뺀 내 값의 순위다.
 */
export interface RankingGain {
  before: number;
  after: number;
  delta: number;
}

/** 주간 순공 밖에서 오른 판. */
export interface RankingBoardGain extends RankingGain {
  type: RankingType;
  /** 명예의 전당은 null이다. */
  period: RankingPeriod | null;
  /** 시간대 판만 값이 있다. */
  slot: TimeSlot | null;
}

/**
 * `GET /api/rankings/session-gains`
 *
 * 오른 판만 온다.
 * `others`는 순공 일·월, 집중률 주·월, 시간대 일·주, 명예의 전당 순이다.
 */
export interface RankingSessionGainsResponse {
  /** 주간 순공이 오르지 않았으면 null이다. */
  weekly: RankingGain | null;
  others: RankingBoardGain[];
}
