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

function setup(initial: SessionState, initialCameraOn = true) {
  const channel = createMockRoomChannel({ snapshot: [] });
  channel.connect();
  channel.published.length = 0; // connect까지의 기록은 관심 밖
  const hook = renderHook(
    ({ sessionState, focusSec, cameraOn }) =>
      useRoomStatePublisher(channel, { sessionState, focusSec, cameraOn }),
    { initialProps: { sessionState: initial, focusSec: 0, cameraOn: initialCameraOn } },
  );
  return { channel, hook };
}

describe("useRoomStatePublisher", () => {
  it("마운트에 카메라 상태와 studySeconds를 1회씩 즉시 발행한다", () => {
    const { channel } = setup(FOCUS_STATE, true);

    expect(channel.published).toEqual([{ cameraOn: true }, { studySeconds: 0 }]);
  });

  it("마운트 즉시 발행은 재렌더에서 반복되지 않는다 — 이후는 60초 주기만 남는다", () => {
    const { channel, hook } = setup(FOCUS_STATE);

    hook.rerender({ sessionState: FOCUS_STATE, focusSec: 5, cameraOn: true });

    expect(channel.published.filter((p) => p.studySeconds !== undefined)).toEqual([
      { studySeconds: 0 },
    ]);
  });

  it("집중 상태 전이에서 FOCUS_CHANGED를 1회 발행하고, 같은 상태 유지 중엔 발행하지 않는다", () => {
    const { channel, hook } = setup(FOCUS_STATE);
    channel.published.length = 0;

    hook.rerender({ sessionState: distractionState("AWAY"), focusSec: 0, cameraOn: true });
    hook.rerender({ sessionState: distractionState("PHONE"), focusSec: 0, cameraOn: true });

    expect(channel.published).toEqual([{ focusState: "DISTRACTED" }]);
  });

  it("카메라 값이 꺼짐으로 바뀌면 CAMERA_CHANGED(false)로 발행되고 FOCUS_CHANGED는 내보내지 않는다", () => {
    const { channel, hook } = setup(FOCUS_STATE);
    channel.published.length = 0;

    hook.rerender({ sessionState: pauseState("MANUAL"), focusSec: 0, cameraOn: false });

    expect(channel.published).toEqual([{ cameraOn: false }]);
  });

  it("카메라 값이 다시 켜지면 CAMERA_CHANGED(true)로 발행된다", () => {
    const { channel, hook } = setup(FOCUS_STATE);
    hook.rerender({ sessionState: pauseState("MANUAL"), focusSec: 0, cameraOn: false });
    channel.published.length = 0;

    hook.rerender({ sessionState: FOCUS_STATE, focusSec: 0, cameraOn: true });

    expect(channel.published).toEqual([{ cameraOn: true }]);
  });

  it("60초마다 최신 focusSec으로 STUDY_TIME을 발행한다", () => {
    const { channel, hook } = setup(FOCUS_STATE);
    channel.published.length = 0;

    hook.rerender({ sessionState: FOCUS_STATE, focusSec: 59, cameraOn: true });
    vi.advanceTimersByTime(60_000);
    hook.rerender({ sessionState: FOCUS_STATE, focusSec: 119, cameraOn: true });
    vi.advanceTimersByTime(60_000);

    expect(channel.published).toEqual([{ studySeconds: 59 }, { studySeconds: 119 }]);
  });

  it("언마운트 후에는 STUDY_TIME이 발행되지 않는다", () => {
    const { channel, hook } = setup(FOCUS_STATE);
    channel.published.length = 0;

    hook.unmount();
    vi.advanceTimersByTime(120_000);

    expect(channel.published).toEqual([]);
  });
});
