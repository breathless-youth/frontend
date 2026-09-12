import type { RoomMember, RoomServerMessage } from "@focusmakers/types";

/**
 * 서버 메시지 → 멤버 목록 반영
 *
 * 상태 메시지의 모르는 userId는 **임시 멤버로 추가한다**(2026-08-25 BY-435 자가복구).
 * 종전에는 무시했는데, SNAPSHOT을 놓치면(재연결 경계·개발 중 상태 리셋 등) 상대의 상태
 * 메시지가 계속 도착해도 목록이 영영 비어 — 실기기에서 시그널링은 되는데 타일이 하나도
 * 없는 증상이 났다. 임시 멤버는 닉네임·목표가 비지만 타일이 폴백으로 안전하게 그린다
 * (`roomTile.test.tsx` 폴백 케이스). 다음 SNAPSHOT/MEMBER_JOINED가 온전한 값으로 교체한다.
 */

/**
 * 임시 멤버 생성값 — 카메라는 켜짐을 단언할 근거가 없으면 꺼짐으로 시작한다(검은 화면을
 * 켜짐으로 그리지 않는 기존 원칙). 실제로 켜져 있다면 다음 CAMERA_CHANGED가 바로잡는다.
 */
function provisionalMember(userId: number, patch: Partial<RoomMember>): RoomMember {
  return { userId, cameraOn: false, focusState: "FOCUS", ...patch };
}

function upsert(members: RoomMember[], userId: number, patch: Partial<RoomMember>): RoomMember[] {
  if (members.some((m) => m.userId === userId)) {
    return members.map((m) => (m.userId === userId ? { ...m, ...patch } : m));
  }
  return [...members, provisionalMember(userId, patch)];
}

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
      return upsert(members, message.userId, { cameraOn: message.cameraOn });
    case "FOCUS_CHANGED":
      return upsert(members, message.userId, { focusState: message.focusState });
    case "STUDY_TIME":
      return upsert(members, message.userId, { studySeconds: message.studySeconds });
    default:
      // SIGNAL 등 멤버 목록과 무관한 메시지 — peerMesh가 처리한다.
      return members;
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
