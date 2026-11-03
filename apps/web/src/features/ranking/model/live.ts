import type {
  RankingBoardResponse,
  RankingEntry,
  RankingNeighbor,
  TimeSlot,
} from "@focusmakers/types";

import i18n from "@/lib/i18n";

import { currentSlot, isOffSlot, isTimeType, slotSubject } from "./board";
import { formatGap, formatRank } from "./format";
import { offSlotNotice } from "./labels";

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
 * 기준선 대비 순위 변동
 *
 * 오른 계단 수는 양수, 내려간 계단 수는 음수로 돌려준다.
 * 어느 한쪽에 내 순위가 없으면 비교하지 않는다.
 * 기간이 다르면 다른 기간 순위끼리 비교하게 되므로 신선한 판이 기준선을 다시 잡을 때까지 비워 둔다.
 */
export function rankChange(
  baseline: Pick<RankingBoardResponse, "me" | "periodStart"> | null,
  board: Pick<RankingBoardResponse, "me" | "periodStart">,
): number | null {
  if (
    baseline === null ||
    baseline.me === null ||
    board.me === null ||
    baseline.periodStart !== board.periodStart
  ) {
    return null;
  }
  return baseline.me.rank - board.me.rank;
}

export type RankChangeTone = "rise" | "drop" | "same";

/**
 * 순위 변동 표기
 *
 * 기호는 화면 낭독기가 기호 이름으로 읽어 뜻이 전해지지 않아 읽을 문장을 따로 둔다.
 * 그대로를 뜻하는 `-`는 알릴 변화가 없어 읽지 않는다.
 */
export function formatRankChange(change: number): {
  text: string;
  spoken: string | null;
  tone: RankChangeTone;
} {
  const steps = formatRank(Math.abs(change));
  if (change > 0) {
    return {
      text: `▲${steps}`,
      spoken: i18n.t("ranking:live.rankUp", { count: Math.abs(change), steps }),
      tone: "rise",
    };
  }
  if (change < 0) {
    return {
      text: `▼${steps}`,
      spoken: i18n.t("ranking:live.rankDown", { count: Math.abs(change), steps }),
      tone: "drop",
    };
  }
  return { text: "-", spoken: null, tone: "same" };
}

/**
 * 아랫줄 색
 *
 * 차이가 벌어지는 중과 따라오는 중은 같은 경고 색을 쓴다.
 */
export type SubLineTone = "alert" | "muted";

export interface SubLine {
  /**
   * 한 줄에 들어가는 문구 한 문장.
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
 * 그래서 그 판에서는 1위여도 이 판에 들어가는 시각만 알린다.
 * 이 문구가 그 판 카드에 순공 시작 버튼이 없는 이유도 함께 설명한다.
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
  if (isOffSlot(board, serverNow)) {
    const notice = offSlotNotice(board);
    return notice === null ? null : { text: notice, tone: "muted" };
  }
  if (above !== null && above.focusing) {
    return { text: i18n.t("ranking:live.gapWidening"), tone: "alert" };
  }
  if (
    isTimeType(board.type) &&
    below !== null &&
    below.focusing &&
    belowGap !== null &&
    belowGap <= CHASE_WINDOW_SEC
  ) {
    return {
      text: i18n.t("ranking:live.gapClosing"),
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
      : {
          text: i18n.t("ranking:live.gapToSecond", { gap: formatGap(board.type, gap) }),
          tone: "muted",
        };
  }
  if (board.type === "FOCUS_TIME") {
    return { text: i18n.t("ranking:live.oneMoreSession"), tone: "muted" };
  }
  if (board.type === "TIME_SLOT" && board.slot !== null) {
    return {
      text: i18n.t("ranking:live.catchUpBeforeSlotEnds", { slot: slotSubject(board.slot) }),
      tone: "muted",
    };
  }
  return null;
}

/** 그 시각이 구간 안이면 다음 6시간 경계까지 남은 초, 밖이면 0. */
function secondsLeftInSlot(atMs: number, slot: TimeSlot): number {
  if (currentSlot(atMs) !== slot) {
    return 0;
  }
  const sixHourMs = 6 * 3_600_000;
  return (sixHourMs - ((atMs + 9 * 3_600_000) % sixHourMs)) / 1000;
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

export interface LiveTrackInput {
  key: string;
  visible: boolean;
  board: RankingBoardResponse | undefined;
  /**
   * 받아 둔 판이 신선한지.
   * 내용이 같은 새 응답은 같은 객체로 남아 참조로는 새 응답을 알 수 없어 이 값으로 구분한다.
   */
  fresh: boolean;
}

/**
 * 판 하나의 다음 기준선
 *
 * 기준선은 사용자가 이 판에서 처음 본 순위라 가려진 동안에는 잡지 않고, 화면이 보일 때 신선한 판이면 그 판을 처음 본 판으로 친다.
 * 오래된 캐시로 잡으면 새 응답이 오자마자 실제로 움직이지 않은 순위가 바뀐 것처럼 보인다.
 * 기간이 새로 시작되면 직전 기간 순위와 비교하지 않도록 새 판으로 다시 잡는다.
 * 처음 볼 때 내 순위가 없었으면 순위가 처음 생긴 판으로 다시 잡아 그 뒤 변동을 보인다.
 * 바뀐 게 없으면 받은 기준선을 그대로 돌려준다.
 */
export function nextBaseline(
  baseline: RankingBoardResponse | undefined,
  input: Omit<LiveTrackInput, "key">,
): RankingBoardResponse | undefined {
  const { board } = input;
  if (!input.visible || !input.fresh || board === undefined) {
    return baseline;
  }
  if (
    baseline === undefined ||
    board.periodStart !== baseline.periodStart ||
    (baseline.me === null && board.me !== null)
  ) {
    return board;
  }
  return baseline;
}
