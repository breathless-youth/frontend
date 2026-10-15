import type { MedalRank, RankingBoardResponse } from "@focusmakers/types";

import { isDayType } from "./board";
import { interpolateRows } from "./live";

/**
 * 시상대 한 자리에 서는 줄
 *
 * 일수 판은 같은 일수 묶음의 대표가 서고, 다른 판은 그 순위의 한 사람이 선다.
 */
export interface PodiumRow {
  nickname: string;
  me: boolean;
  focusing: boolean;
  /**
   * 화면에 그릴 값.
   * 집중 중이면 받은 뒤 지난 초를 더한 값이다.
   */
  display: number;
  /**
   * 대표와 같은 일수인 나머지 인원.
   * 한 사람이 서는 판은 0이다.
   */
  othersCount: number;
}

/**
 * 시상대 한 자리
 *
 * `spot`은 메달·테·받침 높이를 정하는 자리 번호다.
 * `label`은 화면 낭독기가 그 자리에서 읽는 말이다.
 */
export interface PodiumStand {
  spot: MedalRank;
  label: string;
  row: PodiumRow | undefined;
}

const SPOTS: readonly MedalRank[] = [1, 2, 3];

/**
 * 시상대 1·2·3번 자리
 *
 * 일수 판은 `podiumGroups`의 첫 묶음부터 차례로 1·2·3번 자리에 세운다.
 * 일수 판은 공동 순위라 자리 번호 대신 묶음 순위를 읽고, 빈자리는 묶음 순위와 겹치지 않게 `빈자리`로 읽는다.
 * 일수 판의 값은 실시간으로 오르지 않아 묶음 일수를 그대로 쓴다.
 * 일수 판의 `podium`은 늘 빈 배열이라 묶음이 오지 않으면 빈 묶음으로 보고 세 자리를 모두 비운다.
 * 다른 판은 `podium`의 1·2·3위를 세우고, 순위가 자리 번호와 같아 빈자리도 자리 번호로 읽는다.
 */
export function podiumStands(
  board: Pick<RankingBoardResponse, "type" | "podium" | "podiumGroups">,
  elapsedSec: number,
): PodiumStand[] {
  if (isDayType(board.type)) {
    const groups = board.podiumGroups ?? [];
    return SPOTS.map((spot) => {
      const group = groups[spot - 1];
      if (group === undefined) {
        return { spot, label: "빈자리", row: undefined };
      }
      return {
        spot,
        label: `${group.rank}위`,
        row: {
          nickname: group.nickname,
          me: group.me,
          focusing: false,
          display: group.days,
          othersCount: group.othersCount,
        },
      };
    });
  }
  const rows = interpolateRows(board.podium, elapsedSec);
  return SPOTS.map((spot) => {
    const row = rows.find((item) => item.rank === spot);
    return {
      spot,
      label: `${spot}위`,
      row: row && {
        nickname: row.nickname,
        me: row.me,
        focusing: row.focusing,
        display: row.display,
        othersCount: 0,
      },
    };
  });
}
