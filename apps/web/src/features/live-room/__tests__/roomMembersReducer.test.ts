import { describe, expect, it } from "vitest";

import type { RoomMember } from "@focusmakers/types";

import { orderedMembers, roomMembersReducer } from "../roomMembersReducer";

function member(userId: number, overrides: Partial<RoomMember> = {}): RoomMember {
  return {
    userId,
    nickname: `멤버${userId}`,
    goal: null,
    category: null,
    cameraOn: true,
    focusState: "FOCUS",
    studySeconds: 0,
    ...overrides,
  };
}

describe("roomMembersReducer", () => {
  it("SNAPSHOT은 멤버 배열을 통째로 교체한다", () => {
    const state = roomMembersReducer([member(1)], {
      type: "SNAPSHOT",
      members: [member(7), member(8)],
    });

    expect(state.map((m) => m.userId)).toEqual([7, 8]);
  });

  it("MEMBER_JOINED는 뒤에 추가한다", () => {
    const state = roomMembersReducer([member(7)], { type: "MEMBER_JOINED", member: member(8) });

    expect(state.map((m) => m.userId)).toEqual([7, 8]);
  });

  it("같은 userId가 다시 JOINED되면 기존 자리를 교체한다 — 재입장", () => {
    const state = roomMembersReducer([member(7, { cameraOn: false }), member(8)], {
      type: "MEMBER_JOINED",
      member: member(7, { cameraOn: true }),
    });

    expect(state.map((m) => m.userId)).toEqual([7, 8]);
    expect(state[0]?.cameraOn).toBe(true);
  });

  it("MEMBER_LEFT는 해당 멤버만 제거한다", () => {
    const state = roomMembersReducer([member(7), member(8)], { type: "MEMBER_LEFT", userId: 7 });

    expect(state.map((m) => m.userId)).toEqual([8]);
  });

  it("CAMERA_CHANGED는 해당 멤버의 cameraOn만 갱신한다", () => {
    const state = roomMembersReducer([member(7), member(8)], {
      type: "CAMERA_CHANGED",
      userId: 7,
      cameraOn: false,
    });

    expect(state[0]?.cameraOn).toBe(false);
    expect(state[1]?.cameraOn).toBe(true);
  });

  it("FOCUS_CHANGED는 해당 멤버의 focusState만 갱신한다", () => {
    const state = roomMembersReducer([member(7)], {
      type: "FOCUS_CHANGED",
      userId: 7,
      focusState: "DISTRACTED",
    });

    expect(state[0]?.focusState).toBe("DISTRACTED");
  });

  it("STUDY_TIME은 해당 멤버의 studySeconds만 갱신한다", () => {
    const state = roomMembersReducer([member(7)], {
      type: "STUDY_TIME",
      userId: 7,
      studySeconds: 12360,
    });

    expect(state[0]?.studySeconds).toBe(12360);
  });

  it("모르는 userId의 상태 메시지는 무시한다 — JOINED보다 먼저 도착하는 레이스 방어", () => {
    const before = [member(7)];
    const state = roomMembersReducer(before, {
      type: "CAMERA_CHANGED",
      userId: 99,
      cameraOn: false,
    });

    expect(state).toEqual(before);
  });
});

describe("orderedMembers", () => {
  it("내 타일을 항상 첫 번째로 정렬한다", () => {
    const ordered = orderedMembers([member(7), member(8), member(9)], 8);

    expect(ordered.map((m) => m.userId)).toEqual([8, 7, 9]);
  });

  it("내가 목록에 없으면 순서를 바꾸지 않는다", () => {
    const ordered = orderedMembers([member(7), member(8)], 99);

    expect(ordered.map((m) => m.userId)).toEqual([7, 8]);
  });
});
