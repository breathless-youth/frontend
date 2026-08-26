import { describe, expect, it } from "vitest";

import type { RoomMember } from "@focusmakers/types";

import { orderedMembers, roomMembersReducer } from "../roomMembersReducer";

function member(userId: number, overrides: Partial<RoomMember> = {}): RoomMember {
  return {
    userId,
    nickname: `멤버${userId}`,
    goal: null,
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

  it("상태 메시지가 JOINED보다 먼저 와도(레이스) 임시 추가 후 JOINED가 제자리 교체한다 — 중복 없음", () => {
    // 종전 "모르는 userId 무시" 정책의 대체(2026-08-25 BY-435 자가복구) — 무시하면 SNAPSHOT
    // 유실 시 목록이 영영 비었다. 레이스의 원래 걱정(유령/중복)은 교체 경로가 막는다.
    const raced = roomMembersReducer([member(7)], {
      type: "CAMERA_CHANGED",
      userId: 99,
      cameraOn: false,
    });
    const state = roomMembersReducer(raced, { type: "MEMBER_JOINED", member: member(99) });

    expect(state.filter((m) => m.userId === 99)).toHaveLength(1);
    expect(state.find((m) => m.userId === 99)?.nickname).toBe("멤버99");
  });
});

describe("roomMembersReducer 자가복구 — 모르는 userId 상태 메시지 (2026-08-25 BY-435)", () => {
  // SNAPSHOT을 놓치면(재연결 경계 등) 종전에는 상대 신호가 계속 와도 목록이 영영 비었다 —
  // 실기기에서 162번 화면에 145·161 타일이 아예 없던 증상. 상태 메시지가 유령 멤버를
  // 임시 항목으로 되살린다(닉네임·목표는 다음 SNAPSHOT/JOINED까지 폴백 렌더).
  it("CAMERA_CHANGED의 모르는 userId는 그 카메라 상태로 추가한다", () => {
    const state = roomMembersReducer([], { type: "CAMERA_CHANGED", userId: 8, cameraOn: true });

    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({ userId: 8, cameraOn: true });
  });

  it("FOCUS_CHANGED의 모르는 userId는 그 집중 상태로 추가한다 — 카메라는 켜짐을 단언할 근거가 없어 꺼짐", () => {
    const state = roomMembersReducer([], {
      type: "FOCUS_CHANGED",
      userId: 8,
      focusState: "DISTRACTED",
    });

    expect(state[0]).toMatchObject({ userId: 8, focusState: "DISTRACTED", cameraOn: false });
  });

  it("STUDY_TIME의 모르는 userId는 그 순공시간으로 추가한다", () => {
    const state = roomMembersReducer([], { type: "STUDY_TIME", userId: 8, studySeconds: 120 });

    expect(state[0]).toMatchObject({ userId: 8, studySeconds: 120, cameraOn: false });
  });

  it("아는 userId의 상태 메시지는 기존처럼 해당 필드만 갱신한다 — 중복 추가 없음", () => {
    const state = roomMembersReducer([member(8, { cameraOn: false })], {
      type: "CAMERA_CHANGED",
      userId: 8,
      cameraOn: true,
    });

    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({ userId: 8, cameraOn: true, nickname: "멤버8" });
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
