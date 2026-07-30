import { describe, expect, it } from "vitest";

import type { ClosedInterval, SessionCheckpoint } from "../checkpoint";
import { closeOutCheckpoint, computeTotals, PAUSE_AUTO_END_MS } from "../closeout";

const T0 = Date.UTC(2026, 6, 29, 0, 0, 0); // 세션 시작 기준점

function checkpoint(overrides: Partial<SessionCheckpoint>): SessionCheckpoint {
  return {
    schemaVersion: 1,
    sessionId: "sess-1",
    startedAtMs: T0,
    lastAliveAtMs: T0 + 60 * 60_000,
    phase: { kind: "focus" },
    phaseStartedAtMs: T0,
    closedIntervals: [],
    ...overrides,
  };
}

describe("computeTotals (스펙 5절)", () => {
  it("구간에서 파생한다: studySec=span−pause, focusSec=거기서 비집중 추가 차감", () => {
    const intervals: ClosedInterval[] = [
      { status: "PAUSE", startedAtMs: T0 + 10 * 60_000, endedAtMs: T0 + 20 * 60_000 },
      { status: "AWAY", startedAtMs: T0 + 30 * 60_000, endedAtMs: T0 + 35 * 60_000 },
    ];
    expect(computeTotals(T0, T0 + 60 * 60_000, intervals)).toEqual({
      studySec: 50 * 60,
      focusSec: 45 * 60,
    });
  });

  it("무작위 구간 조합에서도 서버 검증 부등식 0 ≤ focusSec ≤ studySec을 만족한다", () => {
    // 겹치지 않는 무작위 구간을 순차 생성하는 결정적 의사난수 성질 검사(시드 고정 LCG)
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let run = 0; run < 50; run += 1) {
      const spanMs = Math.floor(rand() * 3 * 60 * 60_000) + 60_000;
      const intervals: ClosedInterval[] = [];
      let cursor = T0;
      while (cursor < T0 + spanMs - 1000 && rand() > 0.3) {
        const start = cursor + Math.floor(rand() * 5 * 60_000);
        const end = Math.min(start + Math.floor(rand() * 10 * 60_000) + 1000, T0 + spanMs);
        if (end <= start) break;
        intervals.push({
          status: rand() > 0.5 ? "PAUSE" : rand() > 0.5 ? "AWAY" : "PHONE",
          startedAtMs: start,
          endedAtMs: end,
        });
        cursor = end;
      }
      const { studySec, focusSec } = computeTotals(T0, T0 + spanMs, intervals);
      expect(focusSec).toBeGreaterThanOrEqual(0);
      expect(studySec).toBeGreaterThanOrEqual(focusSec);
      expect(studySec).toBeLessThanOrEqual(Math.floor(spanMs / 1000));
    }
  });
});

describe("closeOutCheckpoint (스펙 6절 — 3갈래)", () => {
  const NOW = T0 + 24 * 60 * 60_000; // 복구 판정 시각(다음 날) — 종료 시각으로 쓰이면 안 된다

  it("크래시(focus): lastAliveAtMs로 마감하고 현재 시각을 쓰지 않는다", () => {
    const result = closeOutCheckpoint(checkpoint({}), NOW);
    expect(result).toEqual({ kind: "finalized", endedAtMs: T0 + 60 * 60_000, intervals: [] });
  });

  it("크래시(distracted): 열린 구간을 대표 우선순위로 닫아 포함한다", () => {
    const cp = checkpoint({
      phase: { kind: "distracted", reasons: ["phone", "away"] },
      phaseStartedAtMs: T0 + 50 * 60_000,
    });
    const result = closeOutCheckpoint(cp, NOW);
    expect(result.kind).toBe("finalized");
    if (result.kind === "finalized") {
      expect(result.intervals).toEqual([
        { status: "AWAY", startedAtMs: T0 + 50 * 60_000, endedAtMs: T0 + 60 * 60_000 },
      ]);
    }
  });

  it("paused N분 미경과: 복원 대상이다 (마감하지 않는다)", () => {
    const cp = checkpoint({
      phase: { kind: "paused", cause: "background" },
      phaseStartedAtMs: T0 + 40 * 60_000,
    });
    expect(closeOutCheckpoint(cp, T0 + 40 * 60_000 + PAUSE_AUTO_END_MS - 1)).toEqual({
      kind: "restore",
    });
  });

  it("paused N분 경과: 진입시각+N분으로 마감하고 PAUSE 구간을 포함한다", () => {
    const pausedAt = T0 + 40 * 60_000;
    const cp = checkpoint({
      phase: { kind: "paused", cause: "manual" },
      phaseStartedAtMs: pausedAt,
      lastAliveAtMs: pausedAt,
    });
    const result = closeOutCheckpoint(cp, NOW);
    expect(result).toEqual({
      kind: "finalized",
      endedAtMs: pausedAt + PAUSE_AUTO_END_MS,
      intervals: [
        { status: "PAUSE", startedAtMs: pausedAt, endedAtMs: pausedAt + PAUSE_AUTO_END_MS },
      ],
    });
  });

  it("pauseAutoEndMs 옵션으로 대기 시간을 바꿀 수 있다 (설정 상수 — M1 튜닝)", () => {
    const pausedAt = T0 + 40 * 60_000;
    const cp = checkpoint({
      phase: { kind: "paused", cause: "manual" },
      phaseStartedAtMs: pausedAt,
    });
    const result = closeOutCheckpoint(cp, NOW, { pauseAutoEndMs: 5 * 60_000 });
    expect(result.kind).toBe("finalized");
    if (result.kind === "finalized") {
      expect(result.endedAtMs).toBe(pausedAt + 5 * 60_000);
    }
  });

  it("0ms 열린 구간(전이 직후 크래시)은 이벤트로 만들지 않는다", () => {
    const cp = checkpoint({
      phase: { kind: "distracted", reasons: ["phone"] },
      phaseStartedAtMs: T0 + 60 * 60_000, // lastAliveAtMs와 동일
    });
    const result = closeOutCheckpoint(cp, NOW);
    expect(result.kind).toBe("finalized");
    if (result.kind === "finalized") {
      expect(result.intervals).toEqual([]);
    }
  });
});
