import { describe, expect, it } from "vitest";

import { buildSubmitPayload } from "../payload";

const T0 = Date.UTC(2026, 6, 29, 1, 0, 0);

describe("payload", () => {
  it("체크포인트+마감 결과를 서버 계약 페이로드로 만든다", () => {
    const payload = buildSubmitPayload(
      {
        schemaVersion: 1,
        sessionId: "s",
        startedAtMs: T0,
        lastAliveAtMs: T0,
        phase: { kind: "focus" },
        phaseStartedAtMs: T0,
        closedIntervals: [],
      },
      {
        endedAtMs: T0 + 90 * 60_000,
        intervals: [
          { status: "PAUSE", startedAtMs: T0 + 30 * 60_000, endedAtMs: T0 + 40 * 60_000 },
          { status: "PHONE", startedAtMs: T0 + 10 * 60_000, endedAtMs: T0 + 15 * 60_000 },
          { status: "AWAY", startedAtMs: T0 + 50 * 60_000, endedAtMs: T0 + 50 * 60_000 }, // 0ms — 제외
        ],
      },
    );

    expect(payload).toEqual({
      startedAt: "2026-07-29T01:00:00.000Z",
      endedAt: "2026-07-29T02:30:00.000Z",
      studySec: 80 * 60,
      focusSec: 75 * 60,
      events: [
        {
          status: "PHONE",
          startedAt: "2026-07-29T01:10:00.000Z",
          endedAt: "2026-07-29T01:15:00.000Z",
        },
        {
          status: "PAUSE",
          startedAt: "2026-07-29T01:30:00.000Z",
          endedAt: "2026-07-29T01:40:00.000Z",
        },
      ],
    });
  });

  it("이벤트 없으면 빈 배열이고 focusRate 100% (studySec===focusSec)", () => {
    const payload = buildSubmitPayload(
      {
        schemaVersion: 1,
        sessionId: "s2",
        startedAtMs: T0,
        lastAliveAtMs: T0 + 60 * 60_000,
        phase: { kind: "focus" },
        phaseStartedAtMs: T0,
        closedIntervals: [],
      },
      {
        endedAtMs: T0 + 60 * 60_000,
        intervals: [],
      },
    );

    expect(payload).toEqual({
      startedAt: "2026-07-29T01:00:00.000Z",
      endedAt: "2026-07-29T02:00:00.000Z",
      studySec: 60 * 60,
      focusSec: 60 * 60,
      events: [],
    });
  });
});
