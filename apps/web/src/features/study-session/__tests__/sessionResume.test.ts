import type { StatusEventPayload } from "@focusmakers/types";
import { afterEach, describe, expect, it } from "vitest";

import type { RestoredSession } from "../restoreActiveSession";
import {
  awayMinutes,
  consumeResumeMarker,
  resumeDecision,
  wasPausedAtReport,
  writeResumeMarker,
} from "../sessionResume";
import { AWAY_LIMIT_MS } from "../sessionTuning";

const REPORTED_AT = Date.UTC(2026, 10, 20, 1, 0, 0);

function draft(overrides: Partial<RestoredSession> = {}): RestoredSession {
  return {
    startedAtMs: REPORTED_AT - 30 * 60_000,
    reportedAtMs: REPORTED_AT,
    baseStudySec: 1800,
    baseFocusSec: 1800,
    events: [],
    source: "TIMER",
    ...overrides,
  };
}

const PAUSED_AT_REPORT: StatusEventPayload = {
  status: "PAUSE",
  startedAt: new Date(REPORTED_AT - 60_000).toISOString(),
  endedAt: new Date(REPORTED_AT).toISOString(),
};

describe("resumeDecision", () => {
  it("일시정지 중이 아니던 자율 모드 기록은 2시간까지 묻는다", () => {
    expect(resumeDecision(draft(), REPORTED_AT + 60_000)).toBe("ask");
    expect(resumeDecision(draft(), REPORTED_AT + AWAY_LIMIT_MS)).toBe("ask");
  });

  it("2시간이 넘은 자율 모드 기록은 확정할 기록이다", () => {
    expect(resumeDecision(draft(), REPORTED_AT + AWAY_LIMIT_MS + 1)).toBe("expired");
  });

  it("마지막 보고 때 일시정지 중이던 기록과 관리 모드 기록은 묻지 않는다", () => {
    expect(resumeDecision(draft({ events: [PAUSED_AT_REPORT] }), REPORTED_AT + 60_000)).toBeNull();
    expect(resumeDecision(draft({ source: "MEASURED" }), REPORTED_AT + 60_000)).toBeNull();
  });
});

describe("wasPausedAtReport", () => {
  it("보고 시각에 끝나는 일시정지만 일시정지 중으로 본다", () => {
    expect(wasPausedAtReport(draft({ events: [PAUSED_AT_REPORT] }))).toBe(true);
    expect(
      wasPausedAtReport(
        draft({
          events: [{ ...PAUSED_AT_REPORT, endedAt: new Date(REPORTED_AT - 1_000).toISOString() }],
        }),
      ),
    ).toBe(false);
  });
});

describe("awayMinutes", () => {
  it("분 단위로 내리고 최소 1분이다", () => {
    expect(awayMinutes(0, 32 * 60_000 + 59_000)).toBe(32);
    expect(awayMinutes(0, 5_000)).toBe(1);
  });
});

describe("이어 공부 표시", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("같은 기록을 1분 안에 골랐으면 참이고 읽은 뒤에는 남지 않는다", () => {
    writeResumeMarker(1_000, REPORTED_AT);

    expect(consumeResumeMarker(1_000, REPORTED_AT + 60_000)).toBe(true);
    expect(consumeResumeMarker(1_000, REPORTED_AT + 60_000)).toBe(false);
  });

  it("다른 기록이거나 1분이 지났으면 거짓이다", () => {
    writeResumeMarker(1_000, REPORTED_AT);
    expect(consumeResumeMarker(2_000, REPORTED_AT)).toBe(false);

    writeResumeMarker(1_000, REPORTED_AT);
    expect(consumeResumeMarker(1_000, REPORTED_AT + 60_001)).toBe(false);
  });
});
