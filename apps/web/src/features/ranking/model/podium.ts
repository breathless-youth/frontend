import type { MedalRank, RankingBoardResponse } from "@focusmakers/types";

import { interpolateRows } from "./live";

/** 시상대 한 자리에 서는 줄. */
export interface PodiumRow {
  nickname: string;
  profileImageUrl?: string | null;
  me: boolean;
  focusing: boolean;
  /**
   * 화면에 그릴 값.
   * 집중 중이면 받은 뒤 지난 초를 더한 값이다.
   */
  display: number;
}

/**
 * 시상대 한 자리
 *
 * `spot`은 메달·테·받침 높이를 정하는 자리 번호이고, 순위와 같아 화면 낭독기도 이 번호로 읽는다.
 */
export interface PodiumStand {
  spot: MedalRank;
  row: PodiumRow | undefined;
}

const SPOTS: readonly MedalRank[] = [1, 2, 3];

/**
 * 시상대 1·2·3번 자리
 *
 * 모든 판이 `podium`의 1·2·3위를 세운다.
 */
export function podiumStands(
  board: Pick<RankingBoardResponse, "podium">,
  elapsedSec: number,
): PodiumStand[] {
  const rows = interpolateRows(board.podium, elapsedSec);
  return SPOTS.map((spot) => {
    const row = rows.find((item) => item.rank === spot);
    return {
      spot,
      row: row && {
        nickname: row.nickname,
        profileImageUrl: row.profileImageUrl,
        me: row.me,
        focusing: row.focusing,
        display: row.display,
      },
    };
  });
}
