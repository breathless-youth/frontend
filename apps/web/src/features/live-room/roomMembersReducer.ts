import type { RoomMember, RoomServerMessage } from "@focusmakers/types";

/**
 * 서버 메시지 → 멤버 목록 반영
 *
 * 상태 메시지(CAMERA·FOCUS·STUDY_TIME)에서 모르는 userId는 무시한다 — 브로드캐스트가
 * `MEMBER_JOINED`보다 먼저 도착하는 순서 역전 방어. 이후 SNAPSHOT/JOINED가 최신 값을 싣고 온다.
 */
export function roomMembersReducer(
  members: RoomMember[],
  message: RoomServerMessage,
): RoomMember[] {
  switch (message.type) {
    case "SNAPSHOT":
      return message.members;
    case "MEMBER_JOINED": {
      const exists = members.some((m) => m.userId === message.member.userId);
      if (exists) {
        // 재입장 — 자리 순서는 유지하고 내용만 교체한다.
        return members.map((m) => (m.userId === message.member.userId ? message.member : m));
      }
      return [...members, message.member];
    }
    case "MEMBER_LEFT":
      return members.filter((m) => m.userId !== message.userId);
    case "CAMERA_CHANGED":
      return members.map((m) =>
        m.userId === message.userId ? { ...m, cameraOn: message.cameraOn } : m,
      );
    case "FOCUS_CHANGED":
      return members.map((m) =>
        m.userId === message.userId ? { ...m, focusState: message.focusState } : m,
      );
    case "STUDY_TIME":
      return members.map((m) =>
        m.userId === message.userId ? { ...m, studySeconds: message.studySeconds } : m,
      );
  }
}

/** 내 타일은 그리드 첫 번째 고정 — 나머지는 수신 순서 유지. */
export function orderedMembers(members: RoomMember[], myUserId: number): RoomMember[] {
  const mine = members.filter((m) => m.userId === myUserId);
  if (mine.length === 0) {
    return members;
  }
  return [...mine, ...members.filter((m) => m.userId !== myUserId)];
}
