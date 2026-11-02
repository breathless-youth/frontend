import type { RankingBoardResponse } from "@focusmakers/types";
import { useEffect, useState } from "react";

import { nextBaseline, rankChange, type LiveTrackInput } from "./model/live";

export interface BoardLive {
  change: number | null;
}

type Baselines = ReadonlyMap<string, RankingBoardResponse>;

/**
 * 판별 기준선 보관소
 *
 * 랭킹 화면을 닫았다 다시 열어도 같은 문서 안에서는 처음 본 순위와 비교하도록 화면 밖에 둔다.
 * 그리는 중에는 읽거나 쓰지 않고, 화면을 열 때 읽고 반영된 뒤에 쓴다.
 */
let remembered: Baselines = new Map();

/**
 * 실시간 판의 순위 변동
 *
 * 판마다 이 문서에서 처음 본 순위를 기준선으로 두고 지금 판과 비교한다.
 * 기준선 진행은 그리는 중에 하고 바뀐 경우에만 상태를 고친다(이전 렌더 정보를 상태에 두는 React 권장 방식).
 * 기준선을 받기 전이거나 어느 한쪽에 내 순위가 없으면 null이다.
 * 가려진 동안에는 마지막으로 보인 변동을 그대로 준다.
 * 가려진 동안 글이 바뀌면 화면 낭독기가 알리지 않고, 다시 보일 때는 글이 그대로라 끝내 알리지 못하기 때문이다.
 */
export function useBoardLive(input: LiveTrackInput): BoardLive {
  const [baselines, setBaselines] = useState(() => remembered);
  const current = baselines.get(input.key);
  const baseline = nextBaseline(current, input);
  if (baseline !== current && baseline !== undefined) {
    setBaselines(new Map(baselines).set(input.key, baseline));
  }
  useEffect(() => {
    remembered = baselines;
  }, [baselines]);
  const change = input.board === undefined ? null : rankChange(baseline ?? null, input.board);
  const [shown, setShown] = useState(change);
  if (input.visible && shown !== change) {
    setShown(change);
  }
  return { change: input.visible ? change : shown };
}

export function __resetBoardLiveForTests(): void {
  remembered = new Map();
}
