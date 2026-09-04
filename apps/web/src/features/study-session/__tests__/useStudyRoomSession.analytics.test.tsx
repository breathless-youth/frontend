import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import { createMockFocusDetector } from "../adapters/focusDetector";
import { createMockSystemPauseSource } from "../adapters/systemPauseSource";
import { submitStudySession } from "../submitStudySession";
import { useStudyRoomSession } from "../useStudyRoomSession";

/**
 * 세션 내부 계측(BY-616 확장) — pause/resume에 걸린 이벤트가 **실제로 전이가 일어났을 때만** 한 건씩
 * 나는지, 종료 이벤트가 상태 이벤트 건수를 싣는지 본다(비집중 건별 이벤트는 2026-09-05 재검토로 뺐다).
 * 이벤트 속성 모양은 `lib/__tests__/amplitude.test.ts`가 고정하고, 여기서는 호출 시점과 인자만 본다.
 */
const mocks = vi.hoisted(() => ({
  paused: vi.fn(),
  resumed: vi.fn(),
  ended: vi.fn(),
}));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackStudySessionPaused: mocks.paused,
  trackStudySessionResumed: mocks.resumed,
  trackStudySessionEnded: mocks.ended,
}));

vi.mock("../submitStudySession", () => ({ submitStudySession: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(submitStudySession).mockResolvedValue([]);
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

  it("종료 이벤트에 상태 이벤트 건수를 싣는다 — 비집중 한 건 한 건은 이벤트로 보내지 않는다", async () => {
    const detector = createMockFocusDetector();
    const hook = renderHook(() => useStudyRoomSession(7, { detector }));

    act(() => {
      detector.emit({ trigger: "PHONE", active: true });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000); // enterMs(500) 경과 → DISTRACTION
    });
    act(() => {
      detector.emit({ trigger: "PHONE", active: false });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000); // exitMs(1500) 경과 → FOCUS
    });
    act(() => {
      hook.result.current.pause("MANUAL");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await act(async () => {
      await hook.result.current.endAndSubmit();
    });

    expect(mocks.ended).toHaveBeenCalledTimes(1);
    expect(mocks.ended.mock.calls[0]?.[0]).toMatchObject({
      roomType: "single",
      phoneCount: 1,
      awayCount: 0,
      deviceCount: 0,
      pauseCount: 1,
    });
  });
});
