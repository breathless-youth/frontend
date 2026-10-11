import { useEffect, useState } from "react";

import { DROP_BADGE_MS, advanceLiveTrack, startLiveTrack, type LiveTrackInput } from "./model/live";

export interface BoardLive {
  drop: number | null;
}

/**
 * 실시간 판의 ▼N
 *
 * 새 응답이 올 때마다 직전 응답과 비교하고, 판이 바뀌거나 가려지면 비교 기준을 버린다.
 * 비교는 그리는 중에 하고 바뀐 경우에만 상태를 고친다(이전 렌더 정보를 상태에 두는 React 권장 방식).
 * ▼N은 내려간 응답을 받은 뒤 4초 동안만 돌려준다.
 */
export function useBoardLive(input: LiveTrackInput): BoardLive {
  const [track, setTrack] = useState(() => startLiveTrack(input));
  const next = advanceLiveTrack(track, input);
  if (next !== track) {
    setTrack(next);
  }

  const dropAt = next.drop?.at ?? null;
  const [expiredAt, setExpiredAt] = useState<number | null>(null);
  useEffect(() => {
    if (dropAt === null) {
      return;
    }
    const id = window.setTimeout(() => setExpiredAt(dropAt), DROP_BADGE_MS);
    return () => window.clearTimeout(id);
  }, [dropAt]);

  return {
    drop: next.drop !== null && next.drop.at !== expiredAt ? next.drop.count : null,
  };
}
