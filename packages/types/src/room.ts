/**
 * 실시간 룸 STOMP 메시지 명세
 *
 * 구독
 * - /topic/room/{roomId} 방 전체 브로드캐스트
 * - /user/queue/room 본인 대상 개별
 * 발행
 * - /app/room/{roomId}/state 상태
 * - /app/room/{roomId}/signal 시그널
 */

/** 일시정지는 별도 값이 없다 — 룸에서 일시정지 = 카메라 끔이라 CAMERA_CHANGED가 담당한다. */
export type RoomFocusState = "FOCUS" | "DISTRACTED";

export interface RoomMember {
  userId: number;
  cameraOn: boolean;
  focusState: RoomFocusState;
  nickname?: string;
  goal?: string | null;
  studySeconds?: number;
}

export type RoomSignalKind = "OFFER" | "ANSWER" | "CANDIDATE";

/** 서버 → 클라이언트 수신 메시지 */
export type RoomServerMessage =
  | { type: "SNAPSHOT"; members: RoomMember[] }
  | { type: "MEMBER_JOINED"; member: RoomMember }
  | { type: "MEMBER_LEFT"; userId: number }
  | { type: "CAMERA_CHANGED"; userId: number; cameraOn: boolean }
  | { type: "FOCUS_CHANGED"; userId: number; focusState: RoomFocusState }
  | { type: "STUDY_TIME"; userId: number; studySeconds: number }
  | { type: "SIGNAL"; fromUserId: number; kind: RoomSignalKind; payload: unknown };

/**
 * 상태 발행 - 서버는 type 없는 단일 페이로드를 받아 채워진 필드만 변환해 브로드캐스트한다.
 */
export interface RoomStateUpdate {
  cameraOn?: boolean;
  focusState?: RoomFocusState;
  studySeconds?: number;
}

/** 시그널 발행 — 서버가 fromUserId를 붙여 대상의 개인 큐로 그대로 릴레이한다. */
export interface RoomSignalPublish {
  toUserId: number;
  kind: RoomSignalKind;
  payload: unknown;
}
