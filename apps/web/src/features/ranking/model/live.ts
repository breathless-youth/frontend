import type {
  RankingBoardResponse,
  RankingEntry,
  RankingNeighbor,
  TimeSlot,
} from "@focusmakers/types";

import { SLOT_SUBJECT, isOffSlot, isTimeType } from "./board";
import { formatGap } from "./format";

export interface LiveRow extends RankingEntry {
  /**
   * 화면에 그릴 값.
   * 집중 중이면 받은 뒤 지난 초를 더한 값이다.
   */
  display: number;
}

/**
 * 집중 중인 줄의 값 올리기
 *
 * 줄 순서는 폴링으로만 바뀌므로 올린 값이 바로 위 줄을 넘지 않게 거기서 멈춘다.
 */
export function interpolateRows(rows: readonly RankingEntry[], elapsedSec: number): LiveRow[] {
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  const result: LiveRow[] = [];
  for (const row of sorted) {
    const raised = row.focusing ? row.value + elapsedSec : row.value;
    const ceiling = result.at(-1)?.display ?? Number.POSITIVE_INFINITY;
    result.push({ ...row, display: Math.min(raised, ceiling) });
  }
  return result;
}

export function liveGap(
  neighbor: RankingNeighbor | null,
  meFocusing: boolean,
  elapsedSec: number,
  side: "above" | "below",
): number | null {
  if (neighbor === null) {
    return null;
  }
  const theirs = neighbor.focusing ? elapsedSec : 0;
  const mine = meFocusing ? elapsedSec : 0;
  const gap = side === "above" ? neighbor.gap + theirs - mine : neighbor.gap + mine - theirs;
  return Math.max(0, gap);
}

export function hasFocusing(board: RankingBoardResponse): boolean {
  return (
    board.me?.focusing === true ||
    board.above?.focusing === true ||
    board.below?.focusing === true ||
    board.podium.some((row) => row.focusing) ||
    board.around.some((row) => row.focusing)
  );
}

/**
 * 연달아 받은 두 응답 비교
 *
 * 내 순위가 내려간 계단 수를 돌려주고, 오르거나 그대로면 0이다.
 * 어느 한쪽에 내 순위가 없으면 비교하지 않는다.
 */
export function rankDrop(prev: RankingBoardResponse, next: RankingBoardResponse): number {
  if (prev.me === null || next.me === null) {
    return 0;
  }
  return Math.max(0, next.me.rank - prev.me.rank);
}

/**
 * 아랫줄 색
 *
 * 차이가 벌어지는 중과 따라오는 중은 같은 경고 색을 쓴다.
 */
export type SubLineTone = "alert" | "muted";

export interface SubLine {
  /**
   * 문구 한 문장.
   * 줄을 꼭 나눠야 하는 자리에는 `\n`이 들어 있고, 그리는 쪽은 이 자리에서 반드시 줄을 바꾼다.
   */
  text: string;
  tone: SubLineTone;
}

/** 따라오는 중으로 보는 차이(초). */
const CHASE_WINDOW_SEC = 300;

/**
 * 순위 카드 아랫줄 문구
 *
 * 차이가 벌어지는 중, 따라오는 중, 평소 문구 순으로 먼저 맞는 것을 쓴다.
 * 벌어지는 중은 바로 위 한 사람만 보는데, 차이를 늘리는 것은 그 사람뿐이라서다.
 * 지금 구간이 아닌 시간대 판은 누가 집중 중이어도 그 판 값이 움직이지 않는다.
 * 그래서 그 판에서는 벌어지는 중, 따라오는 중, 구간이 끝나기 전 문구를 쓰지 않고 1위의 차이 문구만 남긴다.
 */
export function rankCardSubLine(input: {
  board: RankingBoardResponse;
  belowGap: number | null;
  serverNow: number;
}): SubLine | null {
  const { board, belowGap, serverNow } = input;
  const { me, above, below } = board;
  if (me === null) {
    return null;
  }
  const offSlot = isOffSlot(board, serverNow);
  if (!offSlot && above !== null && above.focusing) {
    return { text: `${above.nickname}님이 집중 중이라\n차이가 벌어지고 있어요`, tone: "alert" };
  }
  if (
    !offSlot &&
    isTimeType(board.type) &&
    below !== null &&
    below.focusing &&
    belowGap !== null &&
    belowGap <= CHASE_WINDOW_SEC
  ) {
    return {
      text: `${below.nickname}님이 ${formatGap(board.type, belowGap)} 차로 따라오고 있어요`,
      tone: "alert",
    };
  }
  if (me.rank === 1) {
    if (below === null) {
      return null;
    }
    const gap = belowGap ?? below.gap;
    // 2위와 값이 같으면 아래 목록에 같은 수가 보이므로 최소 1분·1일로 적힌 차이를 비운다.
    return gap <= 0
      ? null
      : { text: `${below.nickname}님과 ${formatGap(board.type, gap)} 차이예요`, tone: "muted" };
  }
  if (board.type === "FOCUS_TIME") {
    return { text: "한 세션이면 따라잡을 수 있어요", tone: "muted" };
  }
  if (board.type === "TIME_SLOT" && board.slot !== null && !offSlot) {
    return { text: `${SLOT_SUBJECT[board.slot]} 끝나기 전에 따라잡을 수 있어요`, tone: "muted" };
  }
  return null;
}

/**
 * 구간 시간표(KST 시).
 * 심야는 22시에 시작해 다음 날 4시(28시)에 끝난다.
 */
const SLOT_WINDOW: Record<TimeSlot, { start: number; end: number }> = {
  DAWN: { start: 4, end: 7 },
  MORNING: { start: 7, end: 12 },
  AFTERNOON: { start: 12, end: 18 },
  EVENING: { start: 18, end: 22 },
  NIGHT: { start: 22, end: 28 },
};

/** 그 시각이 구간 안이면 구간이 끝날 때까지 남은 초, 밖이면 0. */
function secondsLeftInSlot(atMs: number, slot: TimeSlot): number {
  const kst = new Date(atMs + 9 * 3_600_000);
  const secOfDay = kst.getUTCHours() * 3600 + kst.getUTCMinutes() * 60 + kst.getUTCSeconds();
  const { start, end } = SLOT_WINDOW[slot];
  // 0~4시는 전날 밤 심야에 이어진다.
  const at = slot === "NIGHT" && secOfDay < 4 * 3600 ? secOfDay + 24 * 3600 : secOfDay;
  if (at < start * 3600 || at >= end * 3600) {
    return 0;
  }
  return end * 3600 - at;
}

/**
 * 보간 상한
 *
 * 응답의 계산 시각부터 이만큼 지나면 집중 중인 값을 더 올리지 않는다.
 * 마감 시각을 넘지 않는다.
 * 시간대 판은 그 구간이 끝나는 시각에서 멈추고, 계산 시각이 구간 밖이면 올리지 않는다.
 */
export function liveCapSec(
  board: Pick<RankingBoardResponse, "type" | "slot" | "asOf" | "closesAt">,
): number {
  const asOfMs = Date.parse(board.asOf);
  let cap =
    board.closesAt === null
      ? Number.POSITIVE_INFINITY
      : (Date.parse(board.closesAt) - asOfMs) / 1000;
  if (board.type === "TIME_SLOT" && board.slot !== null) {
    cap = Math.min(cap, secondsLeftInSlot(asOfMs, board.slot));
  }
  return Math.max(0, Math.floor(cap));
}

export const DROP_BADGE_MS = 4000;

export interface LiveTrackInput {
  key: string;
  visible: boolean;
  board: RankingBoardResponse | undefined;
  updatedAt: number;
}

export interface LiveTrack {
  key: string;
  visible: boolean;
  /**
   * 마지막으로 본 응답.
   * 같은 응답을 두 번 비교하지 않으려고 둔다.
   */
  seen: RankingBoardResponse | undefined;
  /**
   * 비교 기준.
   * 판을 바꾸거나 가려지면 비우고, 그 뒤 처음 오는 새 응답으로 채운다.
   */
  baseline: RankingBoardResponse | null;
  drop: { count: number; at: number } | null;
}

export function startLiveTrack(input: LiveTrackInput): LiveTrack {
  return {
    key: input.key,
    visible: input.visible,
    seen: input.board,
    baseline: null,
    drop: null,
  };
}

/**
 * 비교 기준 한 단계 진행
 *
 * 판이나 보임 여부가 바뀌면 처음부터 다시 시작해 그사이 변화를 ▼N로 보여주지 않는다.
 * 기간이 새로 시작되면 새 응답을 기준으로 다시 시작한다.
 * 바뀐 게 없으면 같은 객체를 돌려준다.
 */
export function advanceLiveTrack(track: LiveTrack, input: LiveTrackInput): LiveTrack {
  if (track.key !== input.key || track.visible !== input.visible) {
    return startLiveTrack(input);
  }
  if (!input.visible || input.board === undefined || input.board === track.seen) {
    return track;
  }
  if (track.baseline === null) {
    return { ...track, seen: input.board, baseline: input.board };
  }
  if (input.board.periodStart !== track.baseline.periodStart) {
    return { ...startLiveTrack(input), baseline: input.board };
  }
  const drop = rankDrop(track.baseline, input.board);
  return {
    ...track,
    seen: input.board,
    baseline: input.board,
    drop: drop > 0 ? { count: drop, at: input.updatedAt } : track.drop,
  };
}
