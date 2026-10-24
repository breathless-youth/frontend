import { describe, expect, it } from "vitest";

import {
  floorToSecondGrid,
  snapStatusEvents,
  snapSubjectTracker,
  snapTimeline,
} from "../displayClock";
import { distractionState, FOCUS_STATE } from "../sessionState";
import { computeSessionTotals, createSessionTimeline, transition } from "../sessionTimeline";
import { createSubjectSegmentTracker, selectSubjectSegment } from "../subjectSegments";

const ORIGIN = 10_000_300;

describe("displayClock", () => {
  it("세션 시작 기준 1초 눈금으로 내리고 0.5초 이상이어도 올리지 않는다", () => {
    expect(floorToSecondGrid(ORIGIN + 1_500, ORIGIN)).toBe(ORIGIN + 1_000);
    expect(floorToSecondGrid(ORIGIN + 2_999, ORIGIN)).toBe(ORIGIN + 2_000);
    expect(floorToSecondGrid(ORIGIN + 3_000, ORIGIN)).toBe(ORIGIN + 3_000);
  });

  it("타임라인 경계를 내린 사본을 만들고 원본과 열린 구간은 그대로 둔다", () => {
    let timeline = createSessionTimeline(ORIGIN);
    timeline = transition(timeline, distractionState("PHONE"), ORIGIN + 1_400);
    timeline = transition(timeline, FOCUS_STATE, ORIGIN + 2_700);

    const snapped = snapTimeline(timeline, ORIGIN);

    expect(snapped.segments.map((s) => [s.startedAtMs - ORIGIN, s.endedAtMs])).toEqual([
      [0, ORIGIN + 1_000],
      [1_000, ORIGIN + 2_000],
      [2_000, null],
    ]);
    expect(timeline.segments[1]!.startedAtMs).toBe(ORIGIN + 1_400);
  });

  it("눈금 위 값은 순공과 총 공부의 차이가 정수 초로 고정되고 실제 값과 전환 수 이하로만 다르다", () => {
    let timeline = createSessionTimeline(ORIGIN);
    timeline = transition(timeline, distractionState("PHONE"), ORIGIN + 1_400);
    timeline = transition(timeline, FOCUS_STATE, ORIGIN + 2_700);
    const snapped = snapTimeline(timeline, ORIGIN);

    for (let nowMs = ORIGIN + 3_000; nowMs < ORIGIN + 6_000; nowMs += 200) {
      const display = computeSessionTotals(snapped, floorToSecondGrid(nowMs, ORIGIN));
      const exact = computeSessionTotals(timeline, nowMs);
      expect(display.studySec - display.focusSec).toBe(1);
      expect(Math.abs(display.focusSec - exact.focusSec)).toBeLessThanOrEqual(2);
      expect(Math.abs(display.studySec - exact.studySec)).toBeLessThanOrEqual(2);
    }
  });

  it("내린 경계는 화면의 지금 시각보다 늦게 놓이지 않아 전환한 틱에 값이 튀지 않는다", () => {
    const before = createSessionTimeline(ORIGIN);
    const after = transition(before, distractionState("PHONE"), ORIGIN + 2_700);

    const steps = Array.from({ length: 10 }, (_, k) => {
      const nowMs = ORIGIN + 2_000 + k * 200;
      const displayNowMs = floorToSecondGrid(nowMs, ORIGIN);
      const snapped = snapTimeline(nowMs < ORIGIN + 2_700 ? before : after, ORIGIN);
      for (const segment of snapped.segments) {
        expect(segment.startedAtMs).toBeLessThanOrEqual(displayNowMs);
      }
      const totals = computeSessionTotals(snapped, displayNowMs);
      return [totals.studySec, totals.focusSec];
    });

    // 2.8초 틱에서 비집중으로 바뀌어도 값은 그대로이고, 3초 눈금부터 총 공부만 오른다.
    expect(steps).toEqual([
      [2, 2],
      [2, 2],
      [2, 2],
      [2, 2],
      [2, 2],
      [3, 2],
      [3, 2],
      [3, 2],
      [3, 2],
      [3, 2],
    ]);
  });

  it("상태 이벤트의 시작·끝을 내린 사본을 만든다", () => {
    const events = [
      {
        status: "PAUSE" as const,
        startedAt: new Date(ORIGIN + 1_400).toISOString(),
        endedAt: new Date(ORIGIN + 3_600).toISOString(),
      },
    ];

    expect(snapStatusEvents(events, ORIGIN)).toEqual([
      {
        status: "PAUSE",
        startedAt: new Date(ORIGIN + 1_000).toISOString(),
        endedAt: new Date(ORIGIN + 3_000).toISOString(),
      },
    ]);
    expect(events[0]!.startedAt).toBe(new Date(ORIGIN + 1_400).toISOString());
  });

  it("과목 구간의 닫힌 구간과 지금 구간 시작을 내린 사본을 만든다", () => {
    let tracker = createSubjectSegmentTracker();
    tracker = selectSubjectSegment(tracker, 1, ORIGIN + 300);
    tracker = selectSubjectSegment(tracker, 2, ORIGIN + 2_600);

    const snapped = snapSubjectTracker(tracker, ORIGIN);

    expect(snapped.closed).toEqual([
      {
        subjectId: 1,
        startedAt: new Date(ORIGIN).toISOString(),
        endedAt: new Date(ORIGIN + 2_000).toISOString(),
      },
    ]);
    expect(snapped.current).toEqual({ subjectId: 2, startedAtMs: ORIGIN + 2_000 });
    expect(tracker.current!.startedAtMs).toBe(ORIGIN + 2_600);
  });
});
