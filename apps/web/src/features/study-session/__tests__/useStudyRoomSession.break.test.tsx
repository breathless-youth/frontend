import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StatusEventPayload } from "@focusmakers/types";

import type * as Amplitude from "@/lib/amplitude";

import { createMockFocusDetector } from "../adapters/focusDetector";
import { createMockSystemPauseSource } from "../adapters/systemPauseSource";
import { BREAK_STATE, FOCUS_STATE, distractionState, pauseState } from "../sessionState";
import type { StudyRoomSessionOptions } from "../useStudyRoomSession";
import { useStudyRoomSession } from "../useStudyRoomSession";

const mocks = vi.hoisted(() => ({
  paused: vi.fn(),
  resumed: vi.fn(),
  distracted: vi.fn(),
}));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackStudySessionPaused: mocks.paused,
  trackStudySessionResumed: mocks.resumed,
  trackStudySessionDistracted: mocks.distracted,
}));

const NOW = Date.UTC(2026, 9, 23, 1, 0, 0);

/** 비로그인 세션이라 진행 스냅샷을 보내지 않는다. */
function setup(options: StudyRoomSessionOptions = {}) {
  const systemPause = createMockSystemPauseSource();
  const hook = renderHook(() => useStudyRoomSession(null, { systemPause, ...options }));
  return { ...hook, systemPause };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function pauseEvents(events: readonly StatusEventPayload[]) {
  return events.filter((event) => event.status === "PAUSE");
}

function durationMs(event: StatusEventPayload) {
  return Date.parse(event.endedAt) - Date.parse(event.startedAt);
}

describe("useStudyRoomSession 휴식", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("휴식은 일시정지 이벤트 하나로 남고 그동안 순공과 총 공부가 멈춘다", async () => {
    const { result } = setup();
    await advance(10_000);

    act(() => {
      result.current.startBreak();
    });
    expect(result.current.sessionState).toEqual(BREAK_STATE);
    await advance(60_000);
    act(() => {
      result.current.endBreak();
    });
    expect(result.current.sessionState).toEqual(FOCUS_STATE);
    await advance(10_000);

    const paused = pauseEvents(result.current.sessionEvents);
    expect(paused).toHaveLength(1);
    expect(durationMs(paused[0]!)).toBe(60_000);
    expect(result.current.focusSec).toBe(20);
    expect(result.current.studySec).toBe(20);
  });

  it("휴식 중 앱을 떠나면 휴식을 끊고 새 일시정지를 열어 이벤트가 겹치지 않는 2건이 된다", async () => {
    const { result, systemPause } = setup();
    await advance(5_000);

    act(() => {
      result.current.startBreak();
    });
    await advance(30_000);
    act(() => {
      systemPause.leave();
    });
    expect(result.current.sessionState).toEqual(pauseState("BACKGROUND"));
    await advance(30_000);
    act(() => {
      result.current.resume();
    });

    const paused = pauseEvents(result.current.sessionEvents);
    expect(paused).toHaveLength(2);
    expect(durationMs(paused[0]!)).toBe(30_000);
    expect(durationMs(paused[1]!)).toBe(30_000);
    expect(Date.parse(paused[0]!.endedAt)).toBeLessThanOrEqual(Date.parse(paused[1]!.startedAt));
  });

  it("휴식 뒤 일시정지에서 다시 휴식에 들어가면 휴식, 일시정지, 휴식 3건이 된다", async () => {
    const { result, systemPause } = setup();
    await advance(5_000);

    act(() => {
      result.current.startBreak();
    });
    await advance(30_000);
    act(() => {
      systemPause.leave();
    });
    await advance(30_000);
    act(() => {
      result.current.startBreak();
    });
    expect(result.current.sessionState).toEqual(BREAK_STATE);
    await advance(30_000);

    const paused = pauseEvents(result.current.sessionEvents);
    expect(paused).toHaveLength(3);
    expect(paused.map(durationMs)).toEqual([30_000, 30_000, 30_000]);
  });

  it("휴식은 임계값을 넘겨도 자동 종료되지 않는다", async () => {
    const { result } = setup({ tuning: { autoEndPauseMinutes: 1 } });

    act(() => {
      result.current.startBreak();
    });
    await advance(180_000);

    expect(result.current.phase.name).toBe("studying");
    expect(result.current.endReason).toBeNull();
  });

  it("휴식 뒤 일시정지는 그 일시정지가 시작된 시각부터 자동 종료를 센다", async () => {
    const { result, systemPause } = setup({ tuning: { autoEndPauseMinutes: 3 } });

    act(() => {
      result.current.startBreak();
    });
    await advance(120_000);
    act(() => {
      systemPause.leave();
    });
    await advance(179_000);
    expect(result.current.phase.name).toBe("studying");

    await advance(2_000);
    expect(result.current.phase.name).not.toBe("studying");
    expect(result.current.endReason).toEqual({ kind: "AUTO", trigger: "BACKGROUND" });
  });

  it("휴식이 아닐 때 endBreak는 아무 일도 하지 않는다", async () => {
    const { result } = setup();
    await advance(5_000);

    act(() => {
      result.current.endBreak();
    });
    await advance(5_000);
    expect(result.current.sessionEvents).toEqual([]);

    act(() => {
      result.current.pause("MANUAL");
    });
    act(() => {
      result.current.endBreak();
    });
    expect(result.current.sessionState).toEqual(pauseState("MANUAL"));
  });

  it("휴식의 시작과 끝은 일시정지·재개 계측에 남지 않는다", async () => {
    const { result } = setup();
    await advance(5_000);

    act(() => {
      result.current.startBreak();
    });
    await advance(30_000);
    act(() => {
      result.current.resume();
    });

    expect(result.current.sessionState).toEqual(FOCUS_STATE);
    expect(mocks.paused).not.toHaveBeenCalled();
    expect(mocks.resumed).not.toHaveBeenCalled();
  });

  it("휴식 중 떠났다 돌아와 휴식을 다시 시작하면 그 일시정지의 시작과 끝이 한 쌍으로 남는다", async () => {
    const { result, systemPause } = setup();
    await advance(5_000);

    act(() => {
      result.current.startBreak();
    });
    await advance(30_000);
    act(() => {
      systemPause.leave();
    });
    await advance(20_000);
    act(() => {
      result.current.startBreak();
    });

    expect(result.current.sessionState).toEqual(BREAK_STATE);
    expect(mocks.paused).toHaveBeenCalledExactlyOnceWith("BACKGROUND", "single");
    expect(mocks.resumed).toHaveBeenCalledExactlyOnceWith({
      pauseSec: 20,
      trigger: "BACKGROUND",
      roomType: "single",
    });
  });

  it("비집중 중에 휴식에 들어가면 비집중 구간이 그 시각에 닫혀 한 건으로 남는다", async () => {
    const detector = createMockFocusDetector();
    const { result } = setup({ detector });
    await advance(5_000);

    act(() => {
      detector.emit({ source: "PHONE", active: true });
    });
    await advance(1_000); // enterMs(1000) 경과 → DISTRACTION
    expect(result.current.sessionState).toEqual(distractionState("PHONE"));
    await advance(9_000);
    act(() => {
      result.current.startBreak();
    });
    await advance(5_000);

    const distractions = result.current.sessionEvents.filter((event) => event.status === "PHONE");
    expect(distractions).toHaveLength(1);
    expect(durationMs(distractions[0]!)).toBe(9_000);
    expect(mocks.distracted).toHaveBeenCalledExactlyOnceWith({
      status: "PHONE",
      durationSec: 9,
      roomType: "single",
    });
    expect(result.current.sessionState).toEqual(BREAK_STATE);
  });
});
