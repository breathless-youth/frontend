import { describe, expect, it } from "vitest";

import { FOCUS_STATE, distractionState, pauseState } from "../sessionState";
import {
  closeSessionTimeline,
  computeSessionTotals,
  createSessionTimeline,
  currentState,
  currentStateSinceMs,
  toStatusEvents,
  transition,
} from "../sessionTimeline";

const T0 = Date.UTC(2026, 6, 26, 1, 0, 0);
const sec = (n: number) => T0 + n * 1000;

describe("computeSessionTotals — 순공/총 공부 2축", () => {
  it("집중만 이어지면 두 값이 같다", () => {
    const timeline = createSessionTimeline(T0);
    expect(computeSessionTotals(timeline, sec(60))).toMatchObject({ studySec: 60, focusSec: 60 });
  });

  it("비집중은 순공만 멈추고 총 공부는 계속 흐른다", () => {
    let timeline = createSessionTimeline(T0);
    timeline = transition(timeline, distractionState("PHONE"), sec(60));
    timeline = transition(timeline, FOCUS_STATE, sec(90));

    const totals = computeSessionTotals(timeline, sec(120));
    expect(totals.studySec).toBe(120);
    expect(totals.focusSec).toBe(90);
    expect(totals.distractionSec).toBe(30);
    expect(totals.pauseSec).toBe(0);
  });

  it("일시정지는 순공·총 공부를 모두 멈추고 벽시계로 별도 집계된다", () => {
    let timeline = createSessionTimeline(T0);
    timeline = transition(timeline, pauseState("MANUAL"), sec(60));
    timeline = transition(timeline, FOCUS_STATE, sec(100));

    const totals = computeSessionTotals(timeline, sec(120));
    expect(totals.studySec).toBe(80);
    expect(totals.focusSec).toBe(80);
    expect(totals.pauseSec).toBe(40);
  });

  it("화면 꺼짐(BACKGROUND)도 수동 일시정지와 똑같이 집계된다", () => {
    let manual = createSessionTimeline(T0);
    manual = transition(manual, pauseState("MANUAL"), sec(10));
    let background = createSessionTimeline(T0);
    background = transition(background, pauseState("BACKGROUND"), sec(10));

    expect(computeSessionTotals(background, sec(50))).toEqual(
      computeSessionTotals(manual, sec(50)),
    );
  });
});

describe("transition", () => {
  it("같은 상태로의 전이는 구간을 쪼개지 않는다", () => {
    let timeline = createSessionTimeline(T0);
    timeline = transition(timeline, distractionState("AWAY"), sec(10));
    const afterFirst = timeline;
    timeline = transition(timeline, distractionState("AWAY"), sec(20));

    expect(timeline).toBe(afterFirst);
    expect(currentStateSinceMs(timeline)).toBe(sec(10));
  });

  it("트리거가 바뀌면 이벤트를 끊고 새로 시작한다", () => {
    let timeline = createSessionTimeline(T0);
    timeline = transition(timeline, distractionState("AWAY"), sec(10));
    timeline = transition(timeline, distractionState("DEVICE"), sec(20));

    expect(timeline.segments).toHaveLength(3);
    expect(currentState(timeline)).toEqual(distractionState("DEVICE"));
  });

  it("닫힌 타임라인에는 더 이상 전이가 적용되지 않는다", () => {
    let timeline = createSessionTimeline(T0);
    timeline = closeSessionTimeline(timeline, sec(60));
    const closed = timeline;

    expect(transition(timeline, pauseState("MANUAL"), sec(70))).toBe(closed);
  });

  it("closeSessionTimeline은 멱등이다 — 재시도해도 같은 값이 나온다", () => {
    let timeline = createSessionTimeline(T0);
    timeline = transition(timeline, distractionState("PHONE"), sec(30));
    const first = closeSessionTimeline(timeline, sec(60));
    const second = closeSessionTimeline(first, sec(90));

    expect(second).toBe(first);
    expect(computeSessionTotals(second, sec(999))).toEqual(computeSessionTotals(first, sec(999)));
  });
});

describe("toStatusEvents", () => {
  it("집중 구간은 이벤트로 기록하지 않고, 비집중·일시정지만 기록한다", () => {
    let timeline = createSessionTimeline(T0);
    timeline = transition(timeline, distractionState("AWAY"), sec(10));
    timeline = transition(timeline, FOCUS_STATE, sec(20));
    timeline = transition(timeline, pauseState("BACKGROUND"), sec(30));
    timeline = transition(timeline, FOCUS_STATE, sec(45));

    const events = toStatusEvents(timeline, sec(60));
    expect(events).toEqual([
      {
        status: "AWAY",
        startedAt: new Date(sec(10)).toISOString(),
        endedAt: new Date(sec(20)).toISOString(),
      },
      {
        status: "PAUSE",
        startedAt: new Date(sec(30)).toISOString(),
        endedAt: new Date(sec(45)).toISOString(),
      },
    ]);
  });

  it("수동/화면꺼짐 구분 없이 PAUSE 하나로 나간다", () => {
    let timeline = createSessionTimeline(T0);
    timeline = transition(timeline, pauseState("MANUAL"), sec(10));
    timeline = transition(timeline, FOCUS_STATE, sec(20));
    timeline = transition(timeline, pauseState("BACKGROUND"), sec(30));

    const events = toStatusEvents(timeline, sec(40));
    expect(events.map((event) => event.status)).toEqual(["PAUSE", "PAUSE"]);
  });

  it("1초 미만 구간은 버린다 — 서버가 0초 이벤트를 거절한다", () => {
    let timeline = createSessionTimeline(T0);
    timeline = transition(timeline, distractionState("DEVICE"), T0 + 5000);
    timeline = transition(timeline, FOCUS_STATE, T0 + 5300);

    expect(toStatusEvents(timeline, sec(60))).toEqual([]);
  });

  it("이벤트 구간이 서로 겹치지 않고 세션 구간 안에 있다", () => {
    let timeline = createSessionTimeline(T0);
    timeline = transition(timeline, distractionState("AWAY"), sec(10));
    timeline = transition(timeline, distractionState("PHONE"), sec(20));
    timeline = transition(timeline, pauseState("MANUAL"), sec(30));

    const endedAtMs = sec(60);
    const events = toStatusEvents(timeline, endedAtMs);
    const bounds = events.map((event) => [
      Date.parse(event.startedAt),
      Date.parse(event.endedAt),
    ]) as [number, number][];

    for (const [start, end] of bounds) {
      expect(end).toBeGreaterThan(start);
      expect(start).toBeGreaterThanOrEqual(T0);
      expect(end).toBeLessThanOrEqual(endedAtMs);
    }
    for (let i = 1; i < bounds.length; i += 1) {
      expect(bounds[i]![0]).toBeGreaterThanOrEqual(bounds[i - 1]![1]);
    }
  });

  it("마지막 구간이 열려 있어도 종료 시각으로 닫아서 기록한다", () => {
    let timeline = createSessionTimeline(T0);
    timeline = transition(timeline, distractionState("PHONE"), sec(10));

    const events = toStatusEvents(timeline, sec(40));
    expect(events).toHaveLength(1);
    expect(events[0]!.endedAt).toBe(new Date(sec(40)).toISOString());
  });
});
