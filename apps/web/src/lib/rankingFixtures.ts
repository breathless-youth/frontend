import type {
  RankingBoardResponse,
  RankingDayGroup,
  RankingEntry,
  RankingRecord,
  RankingRecordsPage,
  RankingRecordsSummary,
  RankingSessionGainsResponse,
  RankingUnseenResponse,
} from "@focusmakers/types";

/**
 * 랭킹 응답 픽스처
 *
 * 테스트와 개발 모드 가짜 응답이 함께 쓴다.
 * 이름과 값은 시안 화면의 것을 그대로 썼다.
 */

const AS_OF = "2026-10-10T05:12:30Z";

/**
 * 판에 해당하지 않는 추가 필드
 *
 * 서버는 필드를 빼지 않고 해당하지 않으면 null로 보낸다.
 */
const NO_EXTRAS = {
  eligibility: null,
  nextTier: null,
  streak: null,
  aroundGroups: null,
  podiumGroups: null,
  goalExamples: null,
} as const;

function row(
  rank: number,
  nickname: string,
  value: number,
  flags: { focusing?: boolean; me?: boolean } = {},
): RankingEntry {
  return { rank, nickname, value, focusing: flags.focusing ?? false, me: flags.me ?? false };
}

const FOCUS_PODIUM: RankingEntry[] = [
  row(1, "새벽공부러", 112360, { focusing: true }),
  row(2, "합격까지달린다", 107290),
  row(3, "수능D-40", 104102, { focusing: true }),
];

/** 순공 주간, 1,205위. */
export const FIXTURE_FOCUS_WEEKLY: RankingBoardResponse = {
  ...NO_EXTRAS,
  type: "FOCUS_TIME",
  period: "WEEKLY",
  slot: null,
  periodStart: "2026-10-05",
  closesAt: "2026-10-11T15:00:00Z",
  asOf: AS_OF,
  podium: FOCUS_PODIUM,
  me: { rank: 1205, value: 45600, focusing: false, topPercent: 37 },
  around: [
    row(1203, "형광펜", 47460),
    row(1204, "커피세잔", 46920),
    row(1205, "오늘도출석", 45600, { me: true }),
    row(1206, "도서관지박령", 45240, { focusing: true }),
    row(1207, "공시생J", 44280, { focusing: true }),
  ],
  above: { nickname: "커피세잔", gap: 1320, focusing: false },
  below: { nickname: "도서관지박령", gap: 360, focusing: true },
  startNowRank: null,
};

/**
 * 위 판에서 세 명이 한꺼번에 넘어온 다음 응답.
 * 두 명이 화면 안 내 위에 있다.
 */
export const FIXTURE_OVERTAKEN: RankingBoardResponse = {
  ...FIXTURE_FOCUS_WEEKLY,
  asOf: "2026-10-10T05:12:45Z",
  me: { rank: 1208, value: 45600, focusing: false, topPercent: 38 },
  around: [
    row(1206, "새벽반장", 45660, { focusing: true }),
    row(1207, "열공모드", 45630, { focusing: true }),
    row(1208, "오늘도출석", 45600, { me: true }),
    row(1209, "도서관지박령", 45420, { focusing: true }),
    row(1210, "공시생J", 44460, { focusing: true }),
  ],
  above: { nickname: "열공모드", gap: 30, focusing: true },
  below: { nickname: "도서관지박령", gap: 180, focusing: true },
};

/** 집중률 주간, 1,704위. */
export const FIXTURE_RATE_WEEKLY: RankingBoardResponse = {
  ...NO_EXTRAS,
  type: "FOCUS_RATE",
  period: "WEEKLY",
  slot: null,
  periodStart: "2026-10-05",
  closesAt: "2026-10-11T15:00:00Z",
  asOf: AS_OF,
  podium: [row(1, "몰입장인", 99.4), row(2, "집중의신", 99.1), row(3, "새벽공부러", 98.9)],
  me: { rank: 1704, value: 96, focusing: false, topPercent: 41 },
  around: [
    row(1702, "집중왕", 96.9),
    row(1703, "형광펜", 96.4),
    row(1704, "오늘도출석", 96, { me: true }),
    row(1705, "커피세잔", 95.8),
    row(1706, "공시생J", 95.5),
  ],
  above: { nickname: "형광펜", gap: 0.4, focusing: false, catchUpFocusSec: 120 },
  below: { nickname: "커피세잔", gap: 0.2, focusing: false },
  startNowRank: null,
  eligibility: {
    eligible: true,
    focusSec: 50400,
    requiredFocusSec: 36000,
    focusRate: 96,
    expectedRank: null,
  },
};

/** 시간대 오전 일간, 4위. */
export const FIXTURE_SLOT_DAILY: RankingBoardResponse = {
  ...NO_EXTRAS,
  type: "TIME_SLOT",
  period: "DAILY",
  slot: "MORNING",
  periodStart: "2026-10-10",
  closesAt: "2026-10-10T15:00:00Z",
  asOf: AS_OF,
  podium: [
    row(1, "합격까지달린다", 10690, { focusing: true }),
    row(2, "새벽공부러", 9660),
    row(3, "수능D-40", 8400),
  ],
  me: { rank: 4, value: 7860, focusing: false, topPercent: 3 },
  around: [
    row(2, "새벽공부러", 9660),
    row(3, "수능D-40", 8400),
    row(4, "오늘도출석", 7860, { me: true }),
    row(5, "형광펜", 7500, { focusing: true }),
    row(6, "커피세잔", 7200),
  ],
  above: { nickname: "수능D-40", gap: 540, focusing: false },
  below: { nickname: "형광펜", gap: 360, focusing: true },
  startNowRank: null,
};

const HALL_BASE = {
  ...NO_EXTRAS,
  period: null,
  slot: null,
  periodStart: null,
  closesAt: null,
  asOf: AS_OF,
  startNowRank: null,
} as const;

/** 명예의 전당 누적 시간, 2,892위. */
export const FIXTURE_TOTAL_TIME: RankingBoardResponse = {
  ...HALL_BASE,
  type: "TOTAL_TIME",
  podium: [
    row(1, "도서관지박령", 17323200),
    row(2, "합격기원", 15804000),
    row(3, "공시생J", 14767200),
  ],
  me: { rank: 2892, value: 1483200, focusing: false, topPercent: 6 },
  around: [
    row(2890, "형광펜", 1508400),
    row(2891, "모의고사1등급", 1495200),
    row(2892, "오늘도출석", 1483200, { me: true }),
    row(2893, "열공모드", 1476000),
    row(2894, "커피세잔", 1468800),
  ],
  above: { nickname: "모의고사1등급", gap: 12000, focusing: false },
  below: { nickname: "열공모드", gap: 7200, focusing: false },
  nextTier: { percent: 5, remaining: 100800, etaDays: 9 },
};

/**
 * 일수 판 묶음 한 줄
 *
 * 서버는 내 묶음에만 같은 일수 중 몇 번째로 도달했는지를 보내므로 그 값이 있으면 내 묶음으로 둔다.
 */
function group(
  days: number,
  rank: number,
  nickname: string,
  othersCount: number,
  achievedDate: string,
  myOrder: number | null = null,
): RankingDayGroup {
  return { days, rank, nickname, othersCount, achievedDate, me: myOrder !== null, myOrder };
}

/**
 * 명예의 전당 누적 일수.
 * 다음 구간 예상 날짜가 없는 경우.
 * 일수 판은 같은 일수끼리 공동 순위라 묶음 순위는 앞 묶음 순위에 앞 묶음 인원을 더한 값이다.
 * 시상대 1위 묶음은 세 명이 같은 일수이고 2위 묶음은 혼자다.
 */
export const FIXTURE_TOTAL_DAYS: RankingBoardResponse = {
  ...HALL_BASE,
  type: "TOTAL_DAYS",
  podium: [],
  me: { rank: 1530, value: 64, focusing: false, topPercent: 22 },
  around: [],
  above: { nickname: "커피세잔", gap: 3, focusing: false },
  below: { nickname: "열공모드", gap: 1, focusing: false },
  nextTier: { percent: 20, remaining: 4, etaDays: null },
  podiumGroups: [
    group(412, 1, "도서관지박령", 2, "2026-10-08"),
    group(388, 4, "합격기원", 0, "2026-10-09"),
    group(351, 5, "공시생J", 1, "2026-10-07"),
  ],
  aroundGroups: [
    group(68, 1519, "형광펜", 5, "2026-10-02"),
    group(67, 1525, "커피세잔", 4, "2026-10-05"),
    group(64, 1530, "오늘도출석", 7, "2026-10-09", 3),
    group(63, 1538, "열공모드", 0, "2026-10-08"),
    group(61, 1539, "공시생J2", 3, "2026-09-30"),
  ],
};

/**
 * 명예의 전당 연속 공부.
 * 시상대 세 묶음 모두 같은 일수인 사람이 더 있다.
 */
export const FIXTURE_STREAK: RankingBoardResponse = {
  ...HALL_BASE,
  type: "MAX_STREAK",
  podium: [],
  me: { rank: 1742, value: 13, focusing: false, topPercent: 40 },
  around: [],
  above: { nickname: "형광펜", gap: 1, focusing: false },
  below: { nickname: "공시생J", gap: 1, focusing: false },
  streak: {
    maxDays: 13,
    maxStart: "2026-09-14",
    maxEnd: "2026-09-26",
    currentDays: 0,
    currentIsBest: false,
    nextRankIfContinue: null,
  },
  podiumGroups: [
    group(186, 1, "새벽러너", 2, "2026-10-10"),
    group(171, 4, "합격기원", 1, "2026-10-10"),
    group(158, 6, "오답노트", 4, "2026-10-09"),
  ],
  aroundGroups: [
    group(15, 1660, "수학의정석", 37, "2026-09-22"),
    group(14, 1698, "형광펜", 43, "2026-09-30"),
    group(13, 1742, "오늘도출석", 41, "2026-09-26", 3),
    group(12, 1784, "공시생J", 55, "2026-08-11"),
    group(11, 1840, "열공모드", 61, "2026-08-02"),
  ],
};

/** 시간대 오전 일간, 내가 1위이고 2위가 5분 차로 따라오는 중. */
export const FIXTURE_FIRST_PLACE: RankingBoardResponse = {
  ...FIXTURE_SLOT_DAILY,
  podium: [
    row(1, "오늘도출석", 11060, { me: true }),
    row(2, "합격까지달린다", 10770, { focusing: true }),
    row(3, "새벽공부러", 9660),
  ],
  me: { rank: 1, value: 11060, focusing: false, topPercent: 1 },
  around: [
    row(1, "오늘도출석", 11060, { me: true }),
    row(2, "합격까지달린다", 10770, { focusing: true }),
    row(3, "새벽공부러", 9660),
    row(4, "수능D-40", 8400),
    row(5, "형광펜", 7500),
  ],
  above: null,
  below: { nickname: "합격까지달린다", gap: 290, focusing: true },
};

/**
 * 순공 일간이 0시에 새로 시작된 직후.
 * 2·3위가 30분이 안 된다.
 */
export const FIXTURE_RESET_DAILY: RankingBoardResponse = {
  ...NO_EXTRAS,
  type: "FOCUS_TIME",
  period: "DAILY",
  slot: null,
  periodStart: "2026-10-10",
  closesAt: "2026-10-10T15:00:00Z",
  asOf: AS_OF,
  podium: [
    row(1, "새벽공부러", 4360, { focusing: true }),
    row(2, "합격까지달린다", 1330),
    row(3, "수능D-40", 1110),
  ],
  me: null,
  around: [],
  above: null,
  below: null,
  startNowRank: 4,
};

/** 위 판의 어제 최종 결과. */
export const FIXTURE_RESET_PREVIOUS: RankingBoardResponse = {
  ...FIXTURE_RESET_DAILY,
  periodStart: "2026-10-09",
  closesAt: "2026-10-09T15:00:00Z",
  podium: [row(1, "도서관지박령", 41200), row(2, "새벽공부러", 39900), row(3, "합격기원", 38800)],
  me: { rank: 1240, value: 25920, focusing: false, topPercent: 30 },
  startNowRank: null,
};

/**
 * 순공 주간에 아직 내 기록이 없다.
 * 목표 예시는 서버처럼 상위 1·5·10·20·30·50% 여섯 줄을 오름차순으로 보낸다.
 * 서버는 분 단위로 올려 보내므로 50%는 분이 붙은 값으로 둔다.
 */
export const FIXTURE_FIRST: RankingBoardResponse = {
  ...FIXTURE_FOCUS_WEEKLY,
  me: null,
  around: [],
  above: null,
  below: null,
  startNowRank: 8211,
  goalExamples: [
    { percent: 1, value: 90000 },
    { percent: 5, value: 54000 },
    { percent: 10, value: 43200 },
    { percent: 20, value: 28800 },
    { percent: 30, value: 18000 },
    { percent: 50, value: 12420 },
  ],
};

/**
 * 위 판의 지난주.
 * 지난주에도 기록이 없다.
 * 지난 기간 판에는 목표 예시가 오지 않는다.
 */
export const FIXTURE_FIRST_PREVIOUS: RankingBoardResponse = {
  ...FIXTURE_FIRST,
  periodStart: "2026-09-28",
  closesAt: "2026-10-04T15:00:00Z",
  startNowRank: null,
  goalExamples: null,
};

/**
 * 집중률 주간 참가 미달.
 * 서버는 지금 집중률로 참가하면 받을 순위의 바로 위를 가운데에 둔 실제 다섯 줄을 보내고, 내 줄은 없다.
 */
export const FIXTURE_INELIGIBLE: RankingBoardResponse = {
  ...FIXTURE_RATE_WEEKLY,
  me: null,
  around: [
    row(1527, "집중왕", 94.5),
    row(1528, "형광펜", 94.3),
    row(1529, "커피세잔", 94.1),
    row(1530, "공시생J", 93.8),
    row(1531, "열공모드", 93.6),
  ],
  above: null,
  below: null,
  eligibility: {
    eligible: false,
    focusSec: 22800,
    requiredFocusSec: 36000,
    focusRate: 94,
    expectedRank: 1530,
    expectedTopPercent: 15,
  },
};

function record(
  id: number,
  fields: Omit<RankingRecord, "id" | "closesAt">,
  closesAt: string,
): RankingRecord {
  return { id, ...fields, closesAt };
}

const RECENT: RankingRecord[] = [
  record(
    31,
    {
      type: "TIME_SLOT",
      period: "DAILY",
      slot: "MORNING",
      periodStart: "2026-10-09",
      rank: 1,
      value: 11060,
    },
    "2026-10-09T15:00:00Z",
  ),
  record(
    30,
    {
      type: "FOCUS_TIME",
      period: "WEEKLY",
      slot: null,
      periodStart: "2026-09-28",
      rank: 3,
      value: 148800,
    },
    "2026-10-04T15:00:00Z",
  ),
  record(
    29,
    {
      type: "FOCUS_TIME",
      period: "DAILY",
      slot: null,
      periodStart: "2026-10-02",
      rank: 1,
      value: 33150,
    },
    "2026-10-02T15:00:00Z",
  ),
  record(
    28,
    {
      type: "FOCUS_RATE",
      period: "WEEKLY",
      slot: null,
      periodStart: "2026-09-21",
      rank: 2,
      value: 98.7,
    },
    "2026-09-27T15:00:00Z",
  ),
  record(
    27,
    {
      type: "TIME_SLOT",
      period: "DAILY",
      slot: "DAWN",
      periodStart: "2026-09-21",
      rank: 1,
      value: 10210,
    },
    "2026-09-21T15:00:00Z",
  ),
  record(
    26,
    {
      type: "TIME_SLOT",
      period: "DAILY",
      slot: "EVENING",
      periodStart: "2026-09-18",
      rank: 3,
      value: 12160,
    },
    "2026-09-18T15:00:00Z",
  ),
];

export const FIXTURE_SUMMARY: RankingRecordsSummary = {
  total: 18,
  firstCount: 7,
  secondCount: 5,
  thirdCount: 6,
  recent: RECENT,
  best: null,
  closest: null,
};

export const FIXTURE_SUMMARY_EMPTY: RankingRecordsSummary = {
  total: 0,
  firstCount: 0,
  secondCount: 0,
  thirdCount: 0,
  recent: [],
  best: { rank: 5, type: "TIME_SLOT", period: "DAILY", slot: "MORNING", periodStart: "2026-10-03" },
  closest: { type: "TIME_SLOT", period: "DAILY", slot: "MORNING", gap: 720 },
};

export const FIXTURE_RECORDS_PAGE: RankingRecordsPage = {
  items: [
    ...RECENT,
    record(
      25,
      {
        type: "TIME_SLOT",
        period: "DAILY",
        slot: "NIGHT",
        periodStart: "2026-09-12",
        rank: 2,
        value: 13205,
      },
      "2026-09-12T19:00:00Z",
    ),
  ],
  nextCursor: null,
};

/** 안 본 메달이 없는 응답. */
export const FIXTURE_UNSEEN_NONE: RankingUnseenResponse = { total: 18, records: [] };

const MORNING_FIRST = record(
  41,
  {
    type: "TIME_SLOT",
    period: "DAILY",
    slot: "MORNING",
    periodStart: "2026-10-09",
    rank: 1,
    value: 11060,
  },
  "2026-10-09T15:00:00Z",
);

const FOCUS_SECOND = record(
  43,
  {
    type: "FOCUS_TIME",
    period: "DAILY",
    slot: null,
    periodStart: "2026-10-09",
    rank: 2,
    value: 34810,
  },
  "2026-10-09T15:00:00Z",
);

const EVENING_THIRD = record(
  44,
  {
    type: "TIME_SLOT",
    period: "DAILY",
    slot: "EVENING",
    periodStart: "2026-10-09",
    rank: 3,
    value: 10080,
  },
  "2026-10-09T15:00:00Z",
);

/** 10월 9일 오전 구간 1위 메달 하나. */
export const FIXTURE_UNSEEN_ONE: RankingUnseenResponse = { total: 19, records: [MORNING_FIRST] };

/** 10월 1주 순공 주간 3위 메달 하나. */
export const FIXTURE_UNSEEN_WEEKLY_THIRD: RankingUnseenResponse = {
  total: 19,
  records: [
    record(
      42,
      {
        type: "FOCUS_TIME",
        period: "WEEKLY",
        slot: null,
        periodStart: "2026-09-28",
        rank: 3,
        value: 148800,
      },
      "2026-10-04T15:00:00Z",
    ),
  ],
};

/** 10월 9일 일간 1·2·3위 메달 셋. */
export const FIXTURE_UNSEEN_THREE: RankingUnseenResponse = {
  total: 21,
  records: [MORNING_FIRST, FOCUS_SECOND, EVENING_THIRD],
};

/** 10월 9일 일간 메달 다섯이고, 1위 둘, 2위 하나, 3위 둘이다. */
export const FIXTURE_UNSEEN_FIVE: RankingUnseenResponse = {
  total: 21,
  records: [
    MORNING_FIRST,
    record(
      45,
      {
        type: "TIME_SLOT",
        period: "DAILY",
        slot: "DAWN",
        periodStart: "2026-10-09",
        rank: 1,
        value: 10210,
      },
      "2026-10-09T15:00:00Z",
    ),
    FOCUS_SECOND,
    EVENING_THIRD,
    record(
      46,
      {
        type: "TIME_SLOT",
        period: "DAILY",
        slot: "AFTERNOON",
        periodStart: "2026-10-09",
        rank: 3,
        value: 9000,
      },
      "2026-10-09T15:00:00Z",
    ),
  ],
};

/**
 * 일간과 주간이 함께 마감된 메달 셋
 *
 * 모두 10월 12일 0시에 마감했다.
 */
export const FIXTURE_UNSEEN_MIXED: RankingUnseenResponse = {
  total: 21,
  records: [
    record(
      47,
      {
        type: "TIME_SLOT",
        period: "DAILY",
        slot: "MORNING",
        periodStart: "2026-10-11",
        rank: 1,
        value: 11060,
      },
      "2026-10-11T15:00:00Z",
    ),
    record(
      48,
      {
        type: "FOCUS_TIME",
        period: "WEEKLY",
        slot: null,
        periodStart: "2026-10-05",
        rank: 2,
        value: 137560,
      },
      "2026-10-11T15:00:00Z",
    ),
    record(
      49,
      {
        type: "TIME_SLOT",
        period: "DAILY",
        slot: "EVENING",
        periodStart: "2026-10-11",
        rank: 3,
        value: 10080,
      },
      "2026-10-11T15:00:00Z",
    ),
  ],
};

/**
 * 주간 순공과 다른 판 넷이 오른 결과
 *
 * 저녁 구간은 일간과 주간이 함께 올랐다.
 */
export const FIXTURE_SESSION_GAINS: RankingSessionGainsResponse = {
  weekly: { before: 1205, after: 1202, delta: 3 },
  others: [
    { type: "FOCUS_RATE", period: "WEEKLY", slot: null, before: 3410, after: 3202, delta: 208 },
    { type: "TIME_SLOT", period: "DAILY", slot: "EVENING", before: 52, after: 43, delta: 9 },
    { type: "TIME_SLOT", period: "WEEKLY", slot: "EVENING", before: 230, after: 226, delta: 4 },
    { type: "TOTAL_TIME", period: null, slot: null, before: 2911, after: 2870, delta: 41 },
  ],
};

/** 주간 순공은 오르지 않고 다른 판만 오른 결과. */
export const FIXTURE_SESSION_GAINS_NO_WEEKLY: RankingSessionGainsResponse = {
  weekly: null,
  others: [
    { type: "FOCUS_RATE", period: "WEEKLY", slot: null, before: 3410, after: 3202, delta: 208 },
  ],
};

/**
 * 오른 판이 없는 결과
 *
 * 그 시각의 세션이 없다는 404도 이 모양으로 바뀐다.
 */
export const FIXTURE_SESSION_GAINS_EMPTY: RankingSessionGainsResponse = {
  weekly: null,
  others: [],
};
