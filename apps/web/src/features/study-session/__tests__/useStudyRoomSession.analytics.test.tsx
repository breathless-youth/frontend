import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import { createMockFocusDetector } from "../adapters/focusDetector";
import { createMockSystemPauseSource } from "../adapters/systemPauseSource";
import { useStudyRoomSession } from "../useStudyRoomSession";

/**
 * 세션 내부 계측(BY-616 확장) — 상태 전이의 단일 통로(`applyState`)와 pause/resume/flipCamera에
 * 걸린 이벤트가 **실제로 전이가 일어났을 때만** 한 건씩 나는지 본다. 이벤트 속성 모양은
 * `lib/__tests__/amplitude.test.ts`가 고정하고, 여기서는 호출 시점과 인자만 본다.
 */
const mocks = vi.hoisted(() => ({
  paused: vi.fn(),
  resumed: vi.fn(),
  distracted: vi.fn(),
  flipped: vi.fn(),
}));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackStudySessionPaused: mocks.paused,
  trackStudySessionResumed: mocks.resumed,
  trackStudySessionDistracted: mocks.distracted,
  trackCameraFlipped: mocks.flipped,
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useStudyRoomSession 계측 (BY-616 확장)", () => {
  it("일시정지·재개를 트리거와 정지 시간으로 남긴다 — 이미 정지 중이면 다시 찍지 않는다", async () => {
    const hook = renderHook(() => useStudyRoomSession(7, { roomType: "single" }));

    act(() => {
      hook.result.current.pause("MANUAL");
    });
    expect(mocks.paused).toHaveBeenCalledWith("MANUAL", "single");

    // 수동 정지 중 화면이 꺼져도 구간은 하나다(6차 확정) — 이벤트도 하나여야 한다.
    act(() => {
      hook.result.current.pause("BACKGROUND");
    });
    expect(mocks.paused).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    act(() => {
      hook.result.current.resume();
    });
    expect(mocks.resumed).toHaveBeenCalledWith({
      pauseSec: 5,
      trigger: "MANUAL",
      roomType: "single",
    });

    // 정지 중이 아닐 때의 resume(카메라 켜기 확인의 중복 호출)은 찍지 않는다.
    act(() => {
      hook.result.current.resume();
    });
    expect(mocks.resumed).toHaveBeenCalledTimes(1);
  });

  it("화면 꺼짐·백그라운드 정지는 BACKGROUND 트리거로, 소셜룸이면 room_type=social로 남긴다", () => {
    const systemPause = createMockSystemPauseSource();
    renderHook(() => useStudyRoomSession(7, { roomType: "social", systemPause }));

    act(() => {
      systemPause.leave();
    });

    expect(mocks.paused).toHaveBeenCalledWith("BACKGROUND", "social");
  });

  it("비집중 구간이 끝나면 상태와 길이를 한 건으로 남긴다 — 시작 시점에는 찍지 않는다", async () => {
    const detector = createMockFocusDetector();
    renderHook(() => useStudyRoomSession(7, { detector }));

    act(() => {
      detector.emit({ trigger: "PHONE", active: true });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000); // enterMs(500) 경과 → DISTRACTION
    });
    expect(mocks.distracted).not.toHaveBeenCalled();

    act(() => {
      detector.emit({ trigger: "PHONE", active: false });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000); // exitMs(1500) 경과 → FOCUS, 구간 닫힘
    });

    expect(mocks.distracted).toHaveBeenCalledTimes(1);
    const [input] = mocks.distracted.mock.calls[0] as [
      { status: string; durationSec: number; roomType: string },
    ];
    expect(input).toMatchObject({ status: "PHONE", roomType: "single" });
    expect(input.durationSec).toBeGreaterThanOrEqual(1);
  });

  it("카메라 전환 결과를 남긴다", async () => {
    const hook = renderHook(() => useStudyRoomSession(7));

    await act(async () => {
      await hook.result.current.flipCamera();
    });

    expect(mocks.flipped).toHaveBeenCalledWith({ ok: true, facing: "back" }, "single");
  });
});
