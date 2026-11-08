import type { PlannerRecordPiece } from "@focusmakers/types";
import { recordTimeOrder } from "./recordTime";

export interface RecordMinute {
  startMs: number;
  endMs: number;
  subjectId: number | null;
}

/** 분별 실제 교차 길이를 합산한다. PAUSE도 포함하며 개인 집계를 대체하지 않는다. */
export function recordPieceMinutes(
  pieces: readonly PlannerRecordPiece[],
  window: { startMs: number; endMs: number },
): RecordMinute[] {
  const minutes = new Map<number, Map<number | null, { length: bigint; end: bigint }>>();
  const windowStart = recordTimeOrder(undefined, window.startMs);
  const windowEnd = recordTimeOrder(undefined, window.endMs);
  for (const piece of pieces) {
    if (
      !piece ||
      !Number.isFinite(Date.parse(piece.startedAt)) ||
      !Number.isFinite(Date.parse(piece.endedAt))
    )
      continue;
    const start = recordTimeOrder(piece.startedAt, 0);
    const end = recordTimeOrder(piece.endedAt, 0);
    const from = start > windowStart ? start : windowStart;
    const to = end < windowEnd ? end : windowEnd;
    if (to <= from) continue;
    for (
      let minute = Math.floor(Number(from / 1_000_000n) / 60_000) * 60_000;
      recordTimeOrder(undefined, minute) < to;
      minute += 60_000
    ) {
      const minStart = recordTimeOrder(undefined, minute);
      const minEnd = recordTimeOrder(undefined, minute + 60_000);
      const clippedStart = from > minStart ? from : minStart;
      const clippedEnd = to < minEnd ? to : minEnd;
      const scores =
        minutes.get(minute) ?? new Map<number | null, { length: bigint; end: bigint }>();
      const previous = scores.get(piece.subjectId);
      scores.set(piece.subjectId, {
        length: (previous?.length ?? 0n) + clippedEnd - clippedStart,
        end: previous && previous.end > clippedEnd ? previous.end : clippedEnd,
      });
      minutes.set(minute, scores);
    }
  }
  return [...minutes]
    .sort(([a], [b]) => a - b)
    .map(([minute, scores]) => {
      const [subjectId] = [...scores].sort(([aId, a], [bId, b]) => {
        if (a.length !== b.length) return a.length > b.length ? -1 : 1;
        if (a.end !== b.end) return a.end > b.end ? -1 : 1;
        return (aId ?? -1) - (bId ?? -1);
      })[0]!;
      return {
        startMs: Math.max(window.startMs, minute),
        endMs: Math.min(window.endMs, minute + 60_000),
        subjectId,
      };
    });
}
