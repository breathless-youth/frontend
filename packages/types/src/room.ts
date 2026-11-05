/**
 * 실시간 룸 STOMP 메시지 명세
 *
 * 구독
 * - /topic/room/{roomId} 방 전체 브로드캐스트
 * - /user/queue/room 본인 대상 개별
 * 발행
 * - /app/room/{roomId}/state 상태(cameraOn, focusState, focusSec, micOn, onBreak)
 * - /app/room/{roomId}/signal 시그널
 * 마이크·휴식·그룹장 필드와 MIC_CHANGED, BREAK_CHANGED, OWNER_CHANGED, KICKED, PEER_BLOCKED는 그룹 공부방에서만 오고 보낸다.
 */

/** 일시정지는 별도 값이 없다 — 룸에서 일시정지 = 카메라 끔이라 CAMERA_CHANGED가 담당한다. */
export type RoomFocusState = "FOCUS" | "DISTRACTED";

export interface RoomMember {
  userId: number;
  cameraOn: boolean;
  focusState: RoomFocusState;
  nickname?: string;
  goal?: string | null;
  // 입장할 때 서버가 복사해 둔 사진이라 방 밖에서 바꾸면 다음 입장부터 바뀐다.
  profileImageUrl?: string | null;
  focusSec?: number;
  // 소켓이 끊겨 30초 유예 중인 멤버. 유예가 끝나면 서버가 MEMBER_LEFT로 지운다.
  disconnected?: boolean;
  // 아래 세 필드는 그룹 공부방 멤버에만 있고 초대코드 방에서는 키가 오지 않는다.
  micOn?: boolean;
  // 휴식은 focusState에 값을 늘리지 않고 이 필드로 따로 온다.
  onBreak?: boolean;
  owner?: boolean;
}

export type RoomSignalKind = "OFFER" | "ANSWER" | "CANDIDATE";

/** 서버 → 클라이언트 수신 메시지 */
export type RoomServerMessage =
  | { type: "SNAPSHOT"; members: RoomMember[] }
  | { type: "MEMBER_JOINED"; member: RoomMember }
  | { type: "MEMBER_LEFT"; userId: number }
  | { type: "CAMERA_CHANGED"; userId: number; cameraOn: boolean }
  | { type: "FOCUS_CHANGED"; userId: number; focusState: RoomFocusState }
  | { type: "STUDY_TIME"; userId: number; focusSec: number }
  | { type: "ROOM_UNAVAILABLE"; roomId: number }
  | { type: "SIGNAL"; fromUserId: number; kind: RoomSignalKind; payload: unknown }
  | { type: "MIC_CHANGED"; userId: number; micOn: boolean }
  | { type: "BREAK_CHANGED"; userId: number; onBreak: boolean }
  // 새 그룹장이 방에 없으면 목록에 없는 userId가 온다.
  | { type: "OWNER_CHANGED"; userId: number }
  // 내보내진 사람의 개인 큐로만 오고, 다른 멤버는 MEMBER_LEFT를 받는다.
  | { type: "KICKED"; groupId: number }
  // 연결하지 말 상대이고, SNAPSHOT 뒤마다 다시 오므로 여러 번 받아도 결과가 같아야 한다.
  | { type: "PEER_BLOCKED"; userId: number };

/**
 * 상태 발행 - 서버는 type 없는 단일 페이로드를 받아 채워진 필드만 변환해 브로드캐스트한다.
 */
export interface RoomStateUpdate {
  cameraOn?: boolean;
  focusState?: RoomFocusState;
  focusSec?: number;
  // 그룹 공부방에서만 보낸다.
  micOn?: boolean;
  onBreak?: boolean;
}

/** 시그널 발행 — 서버가 fromUserId를 붙여 대상의 개인 큐로 그대로 릴레이한다. */
export interface RoomSignalPublish {
  toUserId: number;
  kind: RoomSignalKind;
  payload: unknown;
}
