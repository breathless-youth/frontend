import type { RoomServerMessage, RoomStatePublish } from "@focusmakers/types";

/**
 * 룸 제어 채널 어댑터 — 화면·훅은 이 인터페이스만 안다.
 *
 * 구현은 실제 createStompRoomChannel과 시나리오 재생용 createMockRoomChannel 두 가지다.
 * WebRTC 시그널링 발행은 P2P 영상 티켓에서 이 인터페이스에 추가한다.
 */
export type RoomChannelStatus = "idle" | "connecting" | "open" | "closed";

export interface RoomChannel {
  /** 연결 상태 — 가변 값이라 렌더 판단에 쓰지 말고 이벤트 기반으로만 참고한다. */
  readonly status: RoomChannelStatus;
  /** STOMP 연결 + 토픽 구독 — 서버 쪽에서 자리 예약이 확정된다. */
  connect(): void;
  disconnect(): void;
  /** 서버 메시지 구독. 반환값은 해지 함수. */
  subscribe(listener: (message: RoomServerMessage) => void): () => void;
  /** /app/room/{roomId}/state 발행 — 카메라·집중상태·순공시간. */
  publishState(message: RoomStatePublish): void;
}
