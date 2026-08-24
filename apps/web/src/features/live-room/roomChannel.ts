import type { RoomServerMessage, RoomSignalPublish, RoomStateUpdate } from "@focusmakers/types";

/**
 * INTERFACE
 * 룸 제어 채널 어댑터
 *
 * 구현부
 * - createStompRoomChannel
 * - createMockRoomChannel
 */
export type RoomChannelStatus = "idle" | "connecting" | "open" | "closed";

export interface RoomChannel {
  /** 연결 상태 — 가변 값이라 렌더 판단에 쓰지 말고 이벤트 기반으로만 참고한다. */
  readonly status: RoomChannelStatus;
  connect(): void;
  disconnect(): void;
  /** 서버 메시지 구독 */
  subscribe(listener: (message: RoomServerMessage) => void): () => void;
  /** 발행 */
  /** 카메라·집중상태·순공시간. */
  publishState(message: RoomStateUpdate): void;
  /** WebRTC 시그널 릴레이. */
  publishSignal(message: RoomSignalPublish): void;
}
