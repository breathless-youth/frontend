import type { RankingBoardResponse } from "@focusmakers/types";

import { isTimeType } from "./board";

export type BoardScreen = "first_place" | "ranked" | "streak" | "ineligible" | "reset" | "first";

/**
 * 분석 이벤트에 싣는 화면 상태
 *
 * 연속 공부는 순위가 있는 화면으로 센다.
 */
export type BoardViewState = "ranked" | "first_place" | "reset" | "first" | "ineligible";

/**
 * 직전 기간 결과가 필요한 판
 *
 * 리셋 직후와 처음을 가르려면 직전 기간 결과가 필요하다.
 * 집중률은 참가 조건이 따로 있어 묻지 않는다.
 */
export function needsPreviousPeriod(board: RankingBoardResponse): boolean {
  return board.me === null && isTimeType(board.type);
}

export function classifyBoard(
  board: RankingBoardResponse,
  previous: RankingBoardResponse | null,
): BoardScreen {
  if (board.me !== null) {
    if (board.type === "MAX_STREAK") {
      return "streak";
    }
    return board.me.rank === 1 ? "first_place" : "ranked";
  }
  if (board.type === "FOCUS_RATE") {
    return "ineligible";
  }
  if (needsPreviousPeriod(board) && previous !== null && previous.me !== null) {
    return "reset";
  }
  return "first";
}

export function viewStateOf(screen: BoardScreen): BoardViewState {
  return screen === "streak" ? "ranked" : screen;
}

/**
 * 화면 상태에 맞춘 내 주변 줄
 *
 * 서버는 앞이 모자라면 뒤를 더 주지만, 1위는 나와 뒤 2명만 보여준다.
 */
export function aroundForScreen<T extends { rank: number }>(
  rows: T[],
  screen: BoardScreen,
  meRank: number | null,
): T[] {
  if (screen !== "first_place" || meRank === null) {
    return rows;
  }
  return rows.filter((row) => row.rank <= meRank + 2);
}

/**
 * 화면 상태에 맞춘 내 주변 묶음
 *
 * 1위는 한 사람씩인 목록처럼 내 묶음과 뒤 2묶음만 보여준다.
 * 묶음 순위는 공동 순위라 뒤 묶음까지의 순위 차가 묶음 인원만큼 벌어져, 순위가 아니라 내 묶음부터의 순서로 센다.
 */
export function aroundGroupsForScreen<T extends { me: boolean }>(
  groups: readonly T[],
  screen: BoardScreen,
): readonly T[] {
  const mine = groups.findIndex((group) => group.me);
  if (screen !== "first_place" || mine === -1) {
    return groups;
  }
  return groups.slice(mine, mine + 3);
}
