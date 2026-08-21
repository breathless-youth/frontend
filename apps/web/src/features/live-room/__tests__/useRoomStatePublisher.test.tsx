import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionState } from "@/features/study-session/sessionState";
import { FOCUS_STATE, distractionState, pauseState } from "@/features/study-session/sessionState";

import { createMockRoomChannel } from "../mockRoomChannel";
import { useRoomStatePublisher } from "../useRoomStatePublisher";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(initial: SessionState) {
  const channel = createMockRoomChannel({ snapshot: [] });
  channel.connect();
  channel.published.length = 0; // connect까지의 기록은 관심 밖
  const hook = renderHook(
    ({ sessionState, focusSec }) => useRoomStatePublisher(channel, { sessionState, focusSec }),
    { initialProps: { sessionState: initial, focusSec: 0 } },
  );
  return { channel, hook };
}

describe("useRoomStatePublisher", () => {
  it("마운트 시점에는 아무것도 발행하지 않는다 — 초기 상태는 입장 플로우가 알린다", () => {
    const { channel } = setup(FOCUS_STATE);

    expect(channel.published).toEqual([]);
  });

  it("집중 상태 전이에서 FOCUS_CHANGED를 1회 발행하고, 같은 상태 유지 중엔 발행하지 않는다", () => {
    const { channel, hook } = setup(FOCUS_STATE);

    hook.rerender({ sessionState: distractionState("AWAY"), focusSec: 0 });
    hook.rerender({ sessionState: distractionState("PHONE"), focusSec: 0 });

    expect(channel.published).toEqual([{ type: "FOCUS_CHANGED", focusState: "DISTRACTED" }]);
  });

  it("일시정지 진입은 CAMERA_CHANGED(false)로 발행되고 FOCUS_CHANGED는 내보내지 않는다", () => {
    const { channel, hook } = setup(FOCUS_STATE);

    hook.rerender({ sessionState: pauseState("MANUAL"), focusSec: 0 });

    expect(channel.published).toEqual([{ type: "CAMERA_CHANGED", cameraOn: false }]);
  });

  it("일시정지 해제는 CAMERA_CHANGED(true)로 발행된다", () => {
    const { channel, hook } = setup(FOCUS_STATE);
    hook.rerender({ sessionState: pauseState("MANUAL"), focusSec: 0 });
    channel.published.length = 0;

    hook.rerender({ sessionState: FOCUS_STATE, focusSec: 0 });

    expect(channel.published).toEqual([{ type: "CAMERA_CHANGED", cameraOn: true }]);
  });

  it("60초마다 최신 focusSec으로 STUDY_TIME을 발행한다", () => {
    const { channel, hook } = setup(FOCUS_STATE);

    hook.rerender({ sessionState: FOCUS_STATE, focusSec: 59 });
    vi.advanceTimersByTime(60_000);
    hook.rerender({ sessionState: FOCUS_STATE, focusSec: 119 });
    vi.advanceTimersByTime(60_000);

    expect(channel.published).toEqual([
      { type: "STUDY_TIME", studySeconds: 59 },
      { type: "STUDY_TIME", studySeconds: 119 },
    ]);
  });

  it("언마운트 후에는 STUDY_TIME이 발행되지 않는다", () => {
    const { channel, hook } = setup(FOCUS_STATE);

    hook.unmount();
    vi.advanceTimersByTime(120_000);

    expect(channel.published).toEqual([]);
  });
});
