import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockFocusDetector } from "../adapters/focusDetector";
import { useStudyRoomSession } from "../useStudyRoomSession";
import { visionDiagnostics } from "../vision/diagnostics";
import { measurementDiagnostics } from "../vision/measurement";

/**
 * 실기기 측정용 전이 기록. 훅은 진단 인스턴스를 주입받지 않으므로 모듈 인스턴스를 감시한다 —
 * 측정이 끝나면 이 파일째로 지운다.
 */
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useStudyRoomSession 전이 기록", () => {
  it("비집중 진입과 해제를 진단에 남긴다", async () => {
    const transition = vi.spyOn(visionDiagnostics, "transition").mockImplementation(() => {});
    const detector = createMockFocusDetector();
    renderHook(() => useStudyRoomSession(7, { detector }));

    act(() => {
      detector.emit({ source: "PHONE", active: true });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(transition).toHaveBeenCalledWith("FOCUS", "DISTRACTION:PHONE", expect.any(Number));

    act(() => {
      detector.emit({ source: "PHONE", active: false });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(transition).toHaveBeenLastCalledWith("DISTRACTION:PHONE", "FOCUS", expect.any(Number));
  });

  it("세션이 시작될 때 구간 출발 상태를 되돌리라고 알린다 — 앞 세션의 마지막 상태가 남으면 안 된다", () => {
    const sessionStarted = vi
      .spyOn(measurementDiagnostics, "sessionStarted")
      .mockImplementation(() => {});

    renderHook(() => useStudyRoomSession(7));

    expect(sessionStarted).toHaveBeenCalledTimes(1);
  });

  it("일시정지 전이도 남기고, 전이가 없으면 남기지 않는다", () => {
    const transition = vi.spyOn(visionDiagnostics, "transition").mockImplementation(() => {});
    const hook = renderHook(() => useStudyRoomSession(7));

    act(() => {
      hook.result.current.pause("MANUAL");
    });
    expect(transition).toHaveBeenCalledWith("FOCUS", "PAUSE:MANUAL", expect.any(Number));

    const calls = transition.mock.calls.length;
    act(() => {
      hook.result.current.pause("BACKGROUND");
    });
    expect(transition.mock.calls).toHaveLength(calls);
  });
});
