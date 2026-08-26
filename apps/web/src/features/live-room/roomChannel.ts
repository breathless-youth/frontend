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
  /**
   * 연결을 통째로 갈아 새 세션을 만든다 — 백그라운드 복귀처럼 소켓·구독의 생사가
   * 불확실한 시점의 재구축용. 재연결되면 서버 스냅샷(구독 트리거·재요청 워치독)이
   * 방 상태를 처음부터 다시 동기화한다.
   */
  reconnect(): void;
  /** 서버 메시지 구독 */
  subscribe(listener: (message: RoomServerMessage) => void): () => void;
  /** 발행 */
  /** 카메라·집중상태·순공시간. */
  publishState(message: RoomStateUpdate): void;
  /** WebRTC 시그널 릴레이. */
  publishSignal(message: RoomSignalPublish): void;
}
