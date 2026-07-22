import { describe, expect, it } from "vitest";

import { endSession, recordStatus, startSession, summarizeSession } from "../session";

const S = 1000; // 1초(ms)

describe("StudySession", () => {
  it("세션을 시작하고 상태 변화를 기록해 요약한다", () => {
    let session = startSession(0, "STUDYING");
    session = recordStatus(session, { status: "AWAY", timestampMs: 60 * S });
    session = endSession(session, 120 * S);

    const summary = summarizeSession(session);
    expect(summary.pureStudySeconds).toBe(60);
    expect(summary.totalStudySeconds).toBe(120);
    expect(summary.focusRate).toBe(0.5);
  });

  it("세션 종료는 멱등하다(중복 종료 시 최초 종료 시각 유지)", () => {
    let session = startSession(0);
    session = endSession(session, 100 * S);
    const secondEnd = endSession(session, 200 * S);

    expect(secondEnd.endedAtMs).toBe(100 * S);
    expect(secondEnd).toEqual(session);
    expect(summarizeSession(secondEnd)).toEqual(summarizeSession(session));
  });

  it("종료된 세션에는 새 이벤트가 기록되지 않는다", () => {
    let session = startSession(0);
    session = endSession(session, 100 * S);
    const afterRecord = recordStatus(session, { status: "AWAY", timestampMs: 150 * S });
    expect(afterRecord).toEqual(session);
  });

  it("진행 중 세션은 nowMs까지 집계한다", () => {
    const session = startSession(0, "STUDYING");
    const summary = summarizeSession(session, 30 * S);
    expect(summary.pureStudySeconds).toBe(30);
    expect(summary.totalStudySeconds).toBe(30);
  });
});
