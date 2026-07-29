import type { StudySessionCreateRequest } from "@focuson/types";

import type { ClosedInterval, SessionCheckpoint } from "./checkpoint";
import { computeTotals } from "./closeout";

/** userId는 네이티브(또는 브라우저 단독 모드의 웹)가 붙인다 — 스펙 7절. */
export type SubmitPayload = Omit<StudySessionCreateRequest, "userId">;

export function buildSubmitPayload(
  checkpoint: SessionCheckpoint,
  finalized: { endedAtMs: number; intervals: ClosedInterval[] },
): SubmitPayload {
  // 서버는 겹침·0초 이벤트를 거부한다(계약) — 0ms는 여기서 거르고, 정렬은 가독·결정성용.
  const events = finalized.intervals
    .filter((interval) => interval.endedAtMs > interval.startedAtMs)
    .sort((a, b) => a.startedAtMs - b.startedAtMs)
    .map((interval) => ({
      status: interval.status,
      startedAt: new Date(interval.startedAtMs).toISOString(),
      endedAt: new Date(interval.endedAtMs).toISOString(),
    }));
  const totals = computeTotals(checkpoint.startedAtMs, finalized.endedAtMs, finalized.intervals);
  return {
    startedAt: new Date(checkpoint.startedAtMs).toISOString(),
    endedAt: new Date(finalized.endedAtMs).toISOString(),
    studySec: totals.studySec,
    focusSec: totals.focusSec,
    events,
  };
}
