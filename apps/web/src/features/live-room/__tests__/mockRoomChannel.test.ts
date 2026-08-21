import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RoomMember, RoomServerMessage } from "@focusmakers/types";

import { createMockRoomChannel } from "../mockRoomChannel";

function member(userId: number): RoomMember {
  return {
    userId,
    nickname: `멤버${userId}`,
    goal: null,
    category: null,
    cameraOn: true,
    focusState: "FOCUS",
    studySeconds: 0,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createMockRoomChannel", () => {
  it("connect 시 SNAPSHOT을 즉시 발행하고, 시나리오를 예약된 순서대로 재생한다", () => {
    const received: RoomServerMessage[] = [];
    const channel = createMockRoomChannel({
      snapshot: [member(7)],
      steps: [
        { afterMs: 1000, message: { type: "MEMBER_JOINED", member: member(8) } },
        { afterMs: 2000, message: { type: "MEMBER_LEFT", userId: 8 } },
      ],
    });
    channel.subscribe((message) => received.push(message));

    channel.connect();
    expect(received.map((m) => m.type)).toEqual(["SNAPSHOT"]);
    expect(channel.status).toBe("open");

    vi.advanceTimersByTime(1000);
    expect(received.map((m) => m.type)).toEqual(["SNAPSHOT", "MEMBER_JOINED"]);

    vi.advanceTimersByTime(1000);
    expect(received.map((m) => m.type)).toEqual(["SNAPSHOT", "MEMBER_JOINED", "MEMBER_LEFT"]);
  });

  it("publishState 호출을 기록한다 — 테스트가 발행 페이로드를 검증할 수 있다", () => {
    const channel = createMockRoomChannel({ snapshot: [] });
    channel.connect();

    channel.publishState({ type: "CAMERA_CHANGED", cameraOn: false });

    expect(channel.published).toEqual([{ type: "CAMERA_CHANGED", cameraOn: false }]);
  });

  it("disconnect 후에는 예약된 시나리오가 발행되지 않는다", () => {
    const received: RoomServerMessage[] = [];
    const channel = createMockRoomChannel({
      snapshot: [],
      steps: [{ afterMs: 1000, message: { type: "MEMBER_LEFT", userId: 7 } }],
    });
    channel.subscribe((message) => received.push(message));
    channel.connect();

    channel.disconnect();
    vi.advanceTimersByTime(2000);

    expect(received.map((m) => m.type)).toEqual(["SNAPSHOT"]);
    expect(channel.status).toBe("closed");
  });

  it("구독 해지 후에는 메시지를 받지 않는다", () => {
    const received: RoomServerMessage[] = [];
    const channel = createMockRoomChannel({
      snapshot: [],
      steps: [{ afterMs: 1000, message: { type: "MEMBER_LEFT", userId: 7 } }],
    });
    const unsubscribe = channel.subscribe((message) => received.push(message));
    channel.connect();

    unsubscribe();
    vi.advanceTimersByTime(1000);

    expect(received.map((m) => m.type)).toEqual(["SNAPSHOT"]);
  });
});
