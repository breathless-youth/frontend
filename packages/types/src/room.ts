/**
 * 실시간 룸 STOMP 메시지 계약. 출처는 .ai 레포 product/specs/BY-404-실시간-룸.md이고
 * BE가 같은 명세로 구현 중이다. 백엔드 문서 등재 전이라 등재 후 대조가 필요한 잠정 계약이다.
 *
 * 구독은 /topic/room/{roomId} 방 전체 브로드캐스트와 /user/queue/room 본인 대상 SNAPSHOT,
 * 발행은 /app/room/{roomId}/state 카메라·집중상태·순공시간이다. WebRTC 시그널링 메시지는
 * P2P 영상 티켓에서 추가한다.
 */

/** 일시정지는 별도 값이 없다 — 룸에서 일시정지 = 카메라 끔이라 CAMERA_CHANGED가 담당한다. */
export type RoomFocusState = "FOCUS" | "DISTRACTED";

export interface RoomMember {
  userId: number;
  nickname: string;
  goal: string | null;
  category: string | null;
  cameraOn: boolean;
  focusState: RoomFocusState;
  /** 순공시간(초) — 1분 주기 브로드캐스트, 표시는 HH:MM으로 변환 */
  studySeconds: number;
}

/** 서버 → 클라이언트 수신 메시지 */
export type RoomServerMessage =
  | { type: "SNAPSHOT"; members: RoomMember[] }
  | { type: "MEMBER_JOINED"; member: RoomMember }
  | { type: "MEMBER_LEFT"; userId: number }
  | { type: "CAMERA_CHANGED"; userId: number; cameraOn: boolean }
  | { type: "FOCUS_CHANGED"; userId: number; focusState: RoomFocusState }
  | { type: "STUDY_TIME"; userId: number; studySeconds: number };

/** 클라이언트 → 서버 발행 메시지 */
export type RoomStatePublish =
  | { type: "CAMERA_CHANGED"; cameraOn: boolean }
  | { type: "FOCUS_CHANGED"; focusState: RoomFocusState }
  | { type: "STUDY_TIME"; studySeconds: number };
