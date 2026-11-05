import type { IceServer } from "@focusmakers/types";

import { joinGroupRoom, leaveGroupRoom } from "@/lib/groupRoomApi";
import { leaveRoom, renewLiveRoomSeat } from "@/lib/roomApi";

/**
 * 공부방 종류
 *
 * 숫자 4자리 초대코드로 들어온 방과 그룹 ID로 들어온 그룹 공부방을 한 화면이 함께 그린다.
 * 초대코드 방은 이전 버전 앱이 보낸 링크로도 열려서 화면, 발행, 피어 협상을 지금처럼 유지한다.
 */
export type LiveRoomKind =
  { kind: "invite"; inviteCode: string } | { kind: "group"; groupId: number };

export interface RoomSeat {
  roomId: number;
  graceRejoin: boolean;
  iceServers: IceServer[];
}

/**
 * 공부방 자리 다시 잡기
 *
 * 그룹 공부방은 방이 닫혔다 다시 열리면 방 번호가 바뀌어서 응답의 방 번호를 함께 돌려준다.
 */
export async function renewRoomSeat(room: LiveRoomKind): Promise<RoomSeat> {
  const response =
    room.kind === "invite"
      ? await renewLiveRoomSeat(room.inviteCode)
      : await joinGroupRoom(room.groupId);
  return {
    roomId: response.roomId,
    graceRejoin: response.graceRejoin,
    iceServers: response.iceServers,
  };
}

export function leaveRoomSeat(room: LiveRoomKind, roomId: number): Promise<void> {
  return room.kind === "invite" ? leaveRoom(roomId) : leaveGroupRoom(room.groupId);
}

/** 공부방을 나가면 돌아갈 화면이고, 그룹 공부방은 그 그룹의 그룹 홈이다. */
export function liveRoomHomePath(room: LiveRoomKind): string {
  return room.kind === "invite" ? "/social" : `/social/groups/${room.groupId}`;
}

export function liveRoomResultPath(room: LiveRoomKind, roomId: number): string {
  return room.kind === "invite"
    ? `/social/room/${roomId}/result`
    : `/social/groups/${room.groupId}/room/result`;
}
