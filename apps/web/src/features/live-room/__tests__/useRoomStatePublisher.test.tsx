import { StrictMode } from "react";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RoomMember, RoomServerMessage } from "@focusmakers/types";

import type { SessionState } from "@/features/study-session/sessionState";
import { FOCUS_STATE, distractionState, pauseState } from "@/features/study-session/sessionState";

import { createMockRoomChannel } from "../mockRoomChannel";
import { useRoomStatePublisher } from "../useRoomStatePublisher";

const ME = 7;

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
      useRoomStatePublisher(channel, { sessionState, focusSec, cameraOn, myUserId: ME }),
    { initialProps: { sessionState: initial, focusSec: 0, cameraOn: initialCameraOn } },
  );
  return { channel, hook };
}

type GroupFields = { micOn?: boolean; onBreak?: boolean; cameraOn?: boolean };

/** 마이크와 휴식 값만 바꿔 가며 다시 그린다. 카메라는 따로 주지 않으면 꺼짐이고 나머지 값은 고정이다. */
function renderPublisher(initial: GroupFields) {
  const channel = createMockRoomChannel({ snapshot: [] });
  channel.connect();
  channel.published.length = 0;
  const hook = renderHook(
    (fields: GroupFields) =>
      useRoomStatePublisher(channel, {
        sessionState: FOCUS_STATE,
        focusSec: 0,
        cameraOn: false,
        myUserId: ME,
        ...fields,
      }),
    { initialProps: initial },
  );
  return { channel, rerender: (fields: GroupFields) => hook.rerender(fields) };
}

describe("useRoomStatePublisher 그룹 공부방 필드", () => {
  it("그룹 공부방은 마이크와 휴식을 처음 한 번 보내고 바뀔 때만 보낸다", () => {
    const { channel, rerender } = renderPublisher({ micOn: false, onBreak: false });
    rerender({ micOn: false, onBreak: false });
    rerender({ micOn: true, onBreak: false });
    rerender({ micOn: true, onBreak: true });

    expect(channel.published.filter((message) => "micOn" in message)).toEqual([
      { micOn: false },
      { micOn: true },
    ]);
    expect(channel.published.filter((message) => "onBreak" in message)).toEqual([
      { onBreak: false },
      { onBreak: true },
    ]);
  });

  it("StrictMode가 effect를 다시 돌려도 처음 값은 한 번만 보낸다", () => {
    const channel = createMockRoomChannel({ snapshot: [] });
    renderHook(
      () =>
        useRoomStatePublisher(channel, {
          sessionState: FOCUS_STATE,
          focusSec: 0,
          cameraOn: false,
          micOn: false,
          onBreak: false,
          myUserId: ME,
        }),
      { wrapper: StrictMode },
    );

    expect(channel.published.filter((message) => "micOn" in message)).toEqual([{ micOn: false }]);
    expect(channel.published.filter((message) => "onBreak" in message)).toEqual([
      { onBreak: false },
    ]);
  });

  it("초대코드 방은 새 필드를 보내지 않는다", () => {
    const { channel } = renderPublisher({});

    expect(channel.published.some((message) => "micOn" in message || "onBreak" in message)).toBe(
      false,
    );
  });
});

/** 나와 다른 멤버 한 명이 있는 SNAPSHOT이다. */
function snapshotWithMe(me: Partial<RoomMember>): RoomServerMessage {
  return {
    type: "SNAPSHOT",
    members: [
      { userId: ME, cameraOn: false, focusState: "FOCUS", ...me },
      { userId: 8, cameraOn: true, focusState: "FOCUS", micOn: true, onBreak: true },
    ],
  };
}

describe("useRoomStatePublisher 서버 값 맞추기", () => {
  it("SNAPSHOT의 내 값이 마지막으로 보낸 값과 다르면 그 값만 다시 보낸다", () => {
    const { channel } = renderPublisher({ cameraOn: true, micOn: true, onBreak: false });
    channel.published.length = 0;

    channel.emitServerMessage(snapshotWithMe({ cameraOn: false, micOn: false, onBreak: false }));

    expect(channel.published).toEqual([{ cameraOn: true }, { micOn: true }]);
  });

  it("SNAPSHOT의 내 값이 보낸 값과 같으면 아무것도 보내지 않는다", () => {
    const { channel } = renderPublisher({ cameraOn: true, micOn: true, onBreak: true });
    channel.published.length = 0;

    channel.emitServerMessage(snapshotWithMe({ cameraOn: true, micOn: true, onBreak: true }));

    expect(channel.published).toEqual([]);
  });

  it("휴식이 처음 값으로 돌아가 있어도 다시 보낸다", () => {
    const { channel } = renderPublisher({ micOn: false, onBreak: true });
    channel.published.length = 0;

    channel.emitServerMessage(snapshotWithMe({ cameraOn: false, micOn: false, onBreak: false }));

    expect(channel.published).toEqual([{ onBreak: true }]);
  });

  it("내가 없는 SNAPSHOT에는 아무것도 보내지 않는다", () => {
    const { channel } = renderPublisher({ cameraOn: true, micOn: true, onBreak: false });
    channel.published.length = 0;

    channel.emitServerMessage({
      type: "SNAPSHOT",
      members: [{ userId: 8, cameraOn: false, focusState: "FOCUS" }],
    });

    expect(channel.published).toEqual([]);
  });

  it("초대코드 방은 SNAPSHOT 뒤에도 마이크와 휴식을 보내지 않는다", () => {
    const { channel } = renderPublisher({ cameraOn: true });
    channel.published.length = 0;

    channel.emitServerMessage(snapshotWithMe({ cameraOn: false }));

    expect(channel.published).toEqual([{ cameraOn: true }]);
  });
});

describe("useRoomStatePublisher", () => {
  it("마운트에 카메라 상태와 focusSec를 1회씩 즉시 발행한다", () => {
    const { channel } = setup(FOCUS_STATE, true);

    expect(channel.published).toEqual([{ cameraOn: true }, { focusSec: 0 }]);
  });

  it("마운트 즉시 발행은 재렌더에서 반복되지 않는다 — 이후는 60초 주기만 남는다", () => {
    const { channel, hook } = setup(FOCUS_STATE);

    hook.rerender({ sessionState: FOCUS_STATE, focusSec: 5, cameraOn: true });

    expect(channel.published.filter((p) => p.focusSec !== undefined)).toEqual([{ focusSec: 0 }]);
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

    expect(channel.published).toEqual([{ focusSec: 59 }, { focusSec: 119 }]);
  });

  it("언마운트 후에는 STUDY_TIME이 발행되지 않는다", () => {
    const { channel, hook } = setup(FOCUS_STATE);
    channel.published.length = 0;

    hook.unmount();
    vi.advanceTimersByTime(120_000);

    expect(channel.published).toEqual([]);
  });
});
