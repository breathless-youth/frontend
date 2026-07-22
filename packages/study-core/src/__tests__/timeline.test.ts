import { describe, expect, it } from "vitest";

import { normalizeTimeline, summarizeTimeline } from "../timeline";
import type { FocusTimelineEvent } from "../types";

const S = 1000; // 1초(ms)

describe("summarizeTimeline", () => {
  it("STUDYING 구간만 순공시간에 포함된다", () => {
    const events: FocusTimelineEvent[] = [{ status: "STUDYING", timestampMs: 0 }];
    const summary = summarizeTimeline(events, 60 * S);
    expect(summary.pureStudySeconds).toBe(60);
    expect(summary.totalStudySeconds).toBe(60);
    expect(summary.focusRate).toBe(1);
  });

  it("AWAY 시간은 총공부시간엔 포함되고 순공시간엔 포함되지 않는다", () => {
    const events: FocusTimelineEvent[] = [
      { status: "STUDYING", timestampMs: 0 },
      { status: "AWAY", timestampMs: 60 * S },
    ];
    const summary = summarizeTimeline(events, 120 * S);
    expect(summary.pureStudySeconds).toBe(60);
    expect(summary.totalStudySeconds).toBe(120);
    expect(summary.focusRate).toBe(0.5);
  });

  it("PAUSED 시간은 총공부시간·순공시간 모두 포함되지 않는다", () => {
    const events: FocusTimelineEvent[] = [
      { status: "STUDYING", timestampMs: 0 },
      { status: "PAUSED", timestampMs: 60 * S },
    ];
    const summary = summarizeTimeline(events, 120 * S);
    expect(summary.pureStudySeconds).toBe(60);
    expect(summary.totalStudySeconds).toBe(60);
  });

  it("CAMERA_OFF 시간도 총공부시간·순공시간 모두 포함되지 않는다", () => {
    const events: FocusTimelineEvent[] = [
      { status: "STUDYING", timestampMs: 0 },
      { status: "CAMERA_OFF", timestampMs: 30 * S },
    ];
    const summary = summarizeTimeline(events, 90 * S);
    expect(summary.pureStudySeconds).toBe(30);
    expect(summary.totalStudySeconds).toBe(30);
  });

  it("중복(연속 동일 상태) 이벤트를 안전하게 처리한다", () => {
    const events: FocusTimelineEvent[] = [
      { status: "STUDYING", timestampMs: 0 },
      { status: "STUDYING", timestampMs: 10 * S },
      { status: "STUDYING", timestampMs: 20 * S },
    ];
    const summary = summarizeTimeline(events, 60 * S);
    expect(summary.pureStudySeconds).toBe(60);
    expect(summary.totalStudySeconds).toBe(60);
  });

  it("역순 타임스탬프 입력을 정렬해 처리한다", () => {
    const events: FocusTimelineEvent[] = [
      { status: "AWAY", timestampMs: 60 * S },
      { status: "STUDYING", timestampMs: 0 },
    ];
    const summary = summarizeTimeline(events, 120 * S);
    expect(summary.pureStudySeconds).toBe(60);
    expect(summary.totalStudySeconds).toBe(120);
  });

  it("종료 시각이 마지막 이벤트보다 앞서면 음수 구간을 0으로 클램프한다", () => {
    const events: FocusTimelineEvent[] = [{ status: "STUDYING", timestampMs: 100 * S }];
    const summary = summarizeTimeline(events, 50 * S);
    expect(summary.totalStudySeconds).toBe(0);
    expect(summary.pureStudySeconds).toBe(0);
    expect(summary.focusRate).toBe(0);
  });
});

describe("normalizeTimeline", () => {
  it("연속 중복 상태를 병합하고 오름차순 정렬한다", () => {
    const events: FocusTimelineEvent[] = [
      { status: "AWAY", timestampMs: 30 * S },
      { status: "STUDYING", timestampMs: 0 },
      { status: "STUDYING", timestampMs: 10 * S },
    ];
    expect(normalizeTimeline(events)).toEqual([
      { status: "STUDYING", timestampMs: 0 },
      { status: "AWAY", timestampMs: 30 * S },
    ]);
  });

  it("유한하지 않은 timestamp 이벤트를 제거한다", () => {
    const events: FocusTimelineEvent[] = [
      { status: "STUDYING", timestampMs: 0 },
      { status: "AWAY", timestampMs: Number.NaN },
    ];
    expect(normalizeTimeline(events)).toEqual([{ status: "STUDYING", timestampMs: 0 }]);
  });
});
