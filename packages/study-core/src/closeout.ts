import type { ClosedInterval, SessionCheckpoint } from "./checkpoint";
import { representativeStatus } from "./checkpoint";

/** 일시정지 자동 종료 대기 시간 — 위키 확정 기본 20분, M1 테스트에서 튜닝(하드코딩 금지 원칙). */
export const PAUSE_AUTO_END_MS = 20 * 60 * 1000;

export interface SessionTotals {
  studySec: number;
  focusSec: number;
}

/**
 * 타이머를 별도로 굴리지 않고 구간에서 파생한다(스펙 5절) — 이 구조가 서버 검증 부등식
 * 0 ≤ focusSec ≤ studySec ≤ span−pause를 계산상 자동으로 만족시킨다.
 */
export function computeTotals(
  startedAtMs: number,
  endedAtMs: number,
  intervals: ClosedInterval[],
): SessionTotals {
  const spanMs = Math.max(0, endedAtMs - startedAtMs);
  let pausedMs = 0;
  let distractedMs = 0;
  for (const interval of intervals) {
    const len = Math.max(0, interval.endedAtMs - interval.startedAtMs);
    if (interval.status === "PAUSE") {
      pausedMs += len;
    } else {
      distractedMs += len;
    }
  }
  const studySec = Math.max(0, Math.floor((spanMs - pausedMs) / 1000));
  const focusSec = Math.max(0, Math.floor((spanMs - pausedMs - distractedMs) / 1000));
  return { studySec, focusSec: Math.min(focusSec, studySec) };
}

export type CloseoutResult =
  { kind: "finalized"; endedAtMs: number; intervals: ClosedInterval[] } | { kind: "restore" };

/**
 * 미마감 체크포인트의 소급 마감(스펙 6절). 대원칙: 종료 시각은 측정이 끊긴 시각이며
 * 절대 nowMs(다시 연 시각)를 쓰지 않는다 — nowMs는 paused 경과 판정에만 쓴다.
 */
export function closeOutCheckpoint(
  checkpoint: SessionCheckpoint,
  nowMs: number,
  options?: { pauseAutoEndMs?: number },
): CloseoutResult {
  const pauseAutoEndMs = options?.pauseAutoEndMs ?? PAUSE_AUTO_END_MS;
  const { phase } = checkpoint;

  if (phase.kind === "paused") {
    if (nowMs - checkpoint.phaseStartedAtMs < pauseAutoEndMs) {
      return { kind: "restore" };
    }
    const endedAtMs = checkpoint.phaseStartedAtMs + pauseAutoEndMs;
    return {
      kind: "finalized",
      endedAtMs,
      intervals: appendOpenInterval(checkpoint, "PAUSE", endedAtMs),
    };
  }

  const endedAtMs = checkpoint.lastAliveAtMs;
  if (phase.kind === "distracted") {
    return {
      kind: "finalized",
      endedAtMs,
      intervals: appendOpenInterval(checkpoint, representativeStatus(phase.reasons), endedAtMs),
    };
  }
  return { kind: "finalized", endedAtMs, intervals: [...checkpoint.closedIntervals] };
}

function appendOpenInterval(
  checkpoint: SessionCheckpoint,
  status: ClosedInterval["status"],
  endedAtMs: number,
): ClosedInterval[] {
  const intervals = [...checkpoint.closedIntervals];
  if (endedAtMs > checkpoint.phaseStartedAtMs) {
    intervals.push({ status, startedAtMs: checkpoint.phaseStartedAtMs, endedAtMs });
  }
  return intervals;
}
