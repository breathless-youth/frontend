import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import { createMockFocusDetector } from "../adapters/focusDetector";
import { createMockSystemPauseSource } from "../adapters/systemPauseSource";
import { FOCUS_STATE, distractionState } from "../sessionState";
import { useStudyRoomSession } from "../useStudyRoomSession";

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackStudySessionDistracted: vi.fn(),
}));

const NOW = Date.UTC(2026, 10, 13, 1, 0, 0);

function setup() {
  const detector = createMockFocusDetector();
  const systemPause = createMockSystemPauseSource();
  const hook = renderHook(() => useStudyRoomSession(null, { detector, systemPause }));
  return { ...hook, detector };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useStudyRoomSession 유예", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("유예는 집중 상태로 순공에 들어가고 서버 이벤트를 남기지 않는다", async () => {
    const { result, detector } = setup();
    await advance(5_000);
    act(() => {
      detector.emit({ source: "NO_EVIDENCE", active: true });
    });
    await advance(3_000);
    expect(result.current.grace).toBe(true);
    expect(result.current.sessionState).toEqual(FOCUS_STATE);

    await advance(30_000);
    expect(result.current.grace).toBe(true);
    expect(result.current.focusSec).toBe(38);
    expect(result.current.sessionEvents).toEqual([]);
  });

  it("비집중이 확정되면 유예가 아니고, 그때부터 순공이 멈춘다", async () => {
    const { result, detector } = setup();
    act(() => {
      detector.emit({ source: "AWAY", active: true });
    });
    await advance(9_000);
    expect(result.current.grace).toBe(true);

    await advance(1_000);
    expect(result.current.grace).toBe(false);
    expect(result.current.sessionState).toEqual(distractionState("AWAY"));
    await advance(5_000);
    expect(result.current.focusSec).toBe(10);
  });

  it("공부가 3초 이어지면 유예가 풀린다", async () => {
    const { result, detector } = setup();
    act(() => {
      detector.emit({ source: "PHONE", active: true });
    });
    await advance(4_000);
    act(() => {
      detector.emit({ source: "PHONE", active: false });
    });
    await advance(2_000);
    expect(result.current.grace).toBe(true);
    await advance(1_000);
    expect(result.current.grace).toBe(false);
  });
});
