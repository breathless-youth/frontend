import type {
  RankingBoardResponse,
  RankingPeriod,
  RankingRecordsPage,
  RankingRecordsSummary,
  RankingSessionGainsResponse,
  RankingUnseenResponse,
} from "@focusmakers/types";

import type { RankingBoardParams, RankingRecordsParams } from "./rankingApi";
import {
  FIXTURE_FIRST,
  FIXTURE_FIRST_PLACE,
  FIXTURE_FIRST_PREVIOUS,
  FIXTURE_FOCUS_WEEKLY,
  FIXTURE_INELIGIBLE,
  FIXTURE_OVERTAKEN,
  FIXTURE_RATE_WEEKLY,
  FIXTURE_RECORDS_PAGE,
  FIXTURE_RESET_DAILY,
  FIXTURE_RESET_PREVIOUS,
  FIXTURE_SESSION_GAINS,
  FIXTURE_SESSION_GAINS_EMPTY,
  FIXTURE_SESSION_GAINS_NO_WEEKLY,
  FIXTURE_SLOT_DAILY,
  FIXTURE_STREAK,
  FIXTURE_SUMMARY,
  FIXTURE_SUMMARY_EMPTY,
  FIXTURE_TOTAL_DAYS,
  FIXTURE_TOTAL_TIME,
  FIXTURE_UNSEEN_FIVE,
  FIXTURE_UNSEEN_MIXED,
  FIXTURE_UNSEEN_NONE,
  FIXTURE_UNSEEN_ONE,
  FIXTURE_UNSEEN_THREE,
} from "./rankingFixtures";

/**
 * 개발 모드 랭킹 가짜 응답
 *
 * 백엔드 없이 화면 상태를 보려고 `?rankingMock=<장면>`으로 켠다.
 * `rankingApi`가 개발 모드에서만 동적으로 불러와 운영 빌드에는 들어가지 않는다.
 */
export const RANKING_MOCK_SCENES = [
  "default",
  "overtake",
  "reset",
  "first",
  "ineligible",
  "first-place",
  "no-records",
  "medal-1",
  "medal-3",
  "medal-5",
  "medal-mixed",
  "gain",
  "gain-none",
] as const;
export type RankingMockScene = (typeof RANKING_MOCK_SCENES)[number];

function readScene(): RankingMockScene | null {
  const value = new URLSearchParams(window.location.search).get("rankingMock");
  return RANKING_MOCK_SCENES.find((scene) => scene === value) ?? null;
}

// 앱 안 이동은 URL에서 쿼리를 지우므로 처음 읽을 때 한 번 판정해 둔다.
let sceneCache: RankingMockScene | null | undefined;
let overtakeStep = 0;

export function activeRankingScene(): RankingMockScene | null {
  if (sceneCache === undefined) {
    sceneCache = readScene();
  }
  return sceneCache;
}

export function __resetRankingMockForTests(): void {
  sceneCache = undefined;
  overtakeStep = 0;
}

const HOUR_MS = 3_600_000;
const CLOSES_IN_MS: Record<RankingPeriod, number> = {
  DAILY: 9 * HOUR_MS,
  WEEKLY: (3 * 24 + 14) * HOUR_MS,
  MONTHLY: 12 * 24 * HOUR_MS,
};

/**
 * 지금 기준 시각 맞춤
 *
 * 픽스처 시각은 고정이라 마감 문구가 그럴듯하게 나오도록 지금 기준으로 다시 잡는다.
 */
function fresh(board: RankingBoardResponse): RankingBoardResponse {
  const now = Date.now();
  const closesIn = board.period === null ? null : CLOSES_IN_MS[board.period];
  return {
    ...board,
    asOf: new Date(now).toISOString(),
    closesAt: closesIn === null ? null : new Date(now + closesIn).toISOString(),
  };
}

function pickBoard(scene: RankingMockScene, params: RankingBoardParams): RankingBoardResponse {
  switch (params.type) {
    case "FOCUS_RATE":
      return {
        ...(scene === "ineligible" ? FIXTURE_INELIGIBLE : FIXTURE_RATE_WEEKLY),
        period: params.period ?? "WEEKLY",
      };
    case "TIME_SLOT": {
      const base = scene === "first-place" ? FIXTURE_FIRST_PLACE : FIXTURE_SLOT_DAILY;
      return { ...base, period: params.period ?? "DAILY", slot: params.slot ?? base.slot };
    }
    case "TOTAL_TIME":
      return FIXTURE_TOTAL_TIME;
    case "TOTAL_DAYS":
      return FIXTURE_TOTAL_DAYS;
    case "MAX_STREAK":
      return FIXTURE_STREAK;
    default:
      if (scene === "reset") {
        return { ...FIXTURE_RESET_DAILY, period: params.period ?? "DAILY" };
      }
      if (scene === "first") {
        return { ...FIXTURE_FIRST, period: params.period ?? "WEEKLY" };
      }
      if (scene === "overtake") {
        // 폴링마다 다음 스냅샷으로 넘어가 두 번째 응답부터 ▼N이 보인다.
        const snapshot = overtakeStep === 0 ? FIXTURE_FOCUS_WEEKLY : FIXTURE_OVERTAKEN;
        overtakeStep += 1;
        return { ...snapshot, period: params.period ?? "WEEKLY" };
      }
      return { ...FIXTURE_FOCUS_WEEKLY, period: params.period ?? "WEEKLY" };
  }
}

export function mockBoard(
  scene: RankingMockScene,
  params: RankingBoardParams,
): RankingBoardResponse {
  if (params.offset === -1) {
    const previous = scene === "reset" ? FIXTURE_RESET_PREVIOUS : FIXTURE_FIRST_PREVIOUS;
    return { ...previous, period: params.period ?? previous.period };
  }
  return fresh(pickBoard(scene, params));
}

export function mockSummary(scene: RankingMockScene): RankingRecordsSummary {
  return scene === "no-records" ? FIXTURE_SUMMARY_EMPTY : FIXTURE_SUMMARY;
}

export function mockRecords(
  scene: RankingMockScene,
  params: RankingRecordsParams,
): RankingRecordsPage {
  if (scene === "no-records") {
    return { items: [], nextCursor: null };
  }
  const items = FIXTURE_RECORDS_PAGE.items.filter(
    (item) =>
      (params.rank === undefined || item.rank === params.rank) &&
      (params.type === undefined || item.type === params.type),
  );
  return { items: items.slice(0, params.size), nextCursor: null };
}

const UNSEEN_BY_SCENE: Partial<Record<RankingMockScene, RankingUnseenResponse>> = {
  "medal-1": FIXTURE_UNSEEN_ONE,
  "medal-3": FIXTURE_UNSEEN_THREE,
  "medal-5": FIXTURE_UNSEEN_FIVE,
  "medal-mixed": FIXTURE_UNSEEN_MIXED,
};

/**
 * 안 본 메달
 *
 * 메달 장면이 아니면 빈 목록이라 다른 장면에서 메달 모달이 뜨지 않는다.
 */
export function mockUnseen(scene: RankingMockScene): RankingUnseenResponse {
  return UNSEEN_BY_SCENE[scene] ?? FIXTURE_UNSEEN_NONE;
}

/**
 * 세션 뒤 오른 순위
 *
 * `gain`은 칩 넷(같은 판 둘), `gain-none`은 주간 순공 없음이다.
 */
export function mockSessionGains(scene: RankingMockScene): RankingSessionGainsResponse {
  if (scene === "gain") {
    return FIXTURE_SESSION_GAINS;
  }
  if (scene === "gain-none") {
    return FIXTURE_SESSION_GAINS_NO_WEEKLY;
  }
  return FIXTURE_SESSION_GAINS_EMPTY;
}
