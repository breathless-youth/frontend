import { Client } from "@stomp/stompjs";

import type { RoomServerMessage, RoomSignalPublish, RoomStateUpdate } from "@focusmakers/types";

import { API_BASE_URL } from "@/lib/api";

import type { RoomChannel, RoomChannelStatus } from "./roomChannel";

/**
 * 실제 STOMP 채널 — @stomp/stompjs v7, 순수 WebSocket 전제(SockJS 아님).
 * 재연결은 라이브러리 기본(reconnectDelay 5초)을 쓰되, stompjs가 재연결 시
 * 구독을 복원하지 않으므로 onConnect마다 다시 구독한다.
 *
 * WS URL은 API 베이스에서 파생한다 — dev는 vite 프록시(/ws)를 타고, 배포는
 * VITE_API_BASE_URL의 http(s)를 ws(s)로 바꾼 주소다. 호스트가 분리되는 날 전용 env를 만든다.
 */
export type StompClientConfig = {
  brokerURL: string;
  reconnectDelay: number;
};

/** 테스트 주입용 최소 표면 — @stomp/stompjs의 Client가 구조적으로 만족한다. */
export interface StompClientLike {
  onConnect: (() => void) | undefined;
  activate(): void;
  deactivate(): Promise<void> | void;
  subscribe(destination: string, callback: (frame: { body: string }) => void): unknown;
  publish(params: { destination: string; body: string }): void;
}

type StompRoomChannelOptions = {
  roomId: number;
  userId: number;
  /** 테스트 전용 주입점 — 프로덕션은 기본값(실제 Client)을 쓴다. */
  createClient?: (config: StompClientConfig) => StompClientLike;
};

function defaultCreateClient(config: StompClientConfig): StompClientLike {
  return new Client(config) as unknown as StompClientLike;
}

// 외부 입력 경계 — 서버 계약을 신뢰하지 않는다. JSON으로는 유효하지만 계약에 없는
// 메시지가 리듀서에 undefined를 흘려 렌더를 깨뜨리지 않게 여기서 거른다.
// 멤버는 원소 단위까지 검사한다 — 빈 객체 하나만 섞여도 타일 렌더가 크래시한다.
function isRoomMember(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const member = value as Record<string, unknown>;
  return (
    typeof member.userId === "number" &&
    typeof member.cameraOn === "boolean" &&
    isFocusState(member.focusState) &&
    (member.nickname === undefined || typeof member.nickname === "string") &&
    (member.goal === undefined || member.goal === null || typeof member.goal === "string") &&
    (member.studySeconds === undefined || typeof member.studySeconds === "number")
  );
}

function isFocusState(value: unknown): boolean {
  return value === "FOCUS" || value === "DISTRACTED";
}

function isRoomServerMessage(value: unknown): value is RoomServerMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case "SNAPSHOT":
      return Array.isArray(message.members) && message.members.every(isRoomMember);
    case "MEMBER_JOINED":
      return isRoomMember(message.member);
    case "MEMBER_LEFT":
      return typeof message.userId === "number";
    case "CAMERA_CHANGED":
      return typeof message.userId === "number" && typeof message.cameraOn === "boolean";
    case "FOCUS_CHANGED":
      return typeof message.userId === "number" && isFocusState(message.focusState);
    case "STUDY_TIME":
      return typeof message.userId === "number" && typeof message.studySeconds === "number";
    case "SIGNAL":
      return (
        typeof message.fromUserId === "number" &&
        (message.kind === "OFFER" || message.kind === "ANSWER" || message.kind === "CANDIDATE") &&
        message.payload !== undefined
      );
    default:
      return false;
  }
}

export function createStompRoomChannel({
  roomId,
  userId,
  createClient = defaultCreateClient,
}: StompRoomChannelOptions): RoomChannel {
  let status: RoomChannelStatus = "idle";
  const listeners = new Set<(message: RoomServerMessage) => void>();

  const wsBase = (API_BASE_URL || window.location.origin).replace(/^http/, "ws");
  const client = createClient({
    brokerURL: `${wsBase}/ws?userId=${userId}`,
    reconnectDelay: 5000,
  });

  function handleFrame(frame: { body: string }) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(frame.body);
    } catch {
      // 깨진 본문은 버린다
      return;
    }
    if (!isRoomServerMessage(parsed)) {
      return;
    }
    if (parsed.type === "SNAPSHOT") {
      // 계약을 통과한 SNAPSHOT만 도착으로 친다 — 깨진 스냅샷이면 워치독이 계속 재요청한다.
      snapshotReceived = true;
      clearSnapshotWatchdog();
    }
    for (const listener of listeners) {
      listener(parsed);
    }
  }

  /**
   * SNAPSHOT 재요청 워치독(BY-442) — 서버는 방 토픽 구독을 입장 확정으로 보고 SNAPSHOT을
   * 개인 큐로 즉시 쏘는데, Spring 인바운드 처리 순서가 보장되지 않아 개인 큐 등록 전에
   * 발사되면 유실된다(실서버 실측 — 유실되면 멤버 목록이 비어 영원히 혼자 화면). 그래서
   * 연결마다 직접 요청하고, 못 받으면 2초 간격으로 재요청한다: 첫 요청이 같은 레이스에
   * 져도 재시도 시점엔 구독이 확실히 등록돼 있어 자기 치유가 보장된다. 재연결 요청은
   * 끊긴 사이의 멤버 변동 재동기화를 겸한다(중복 SNAPSHOT은 수신측이 멱등 처리 — 리듀서
   * 목록 교체·유예 기준값 최초 1회 채택). BE가 목적지를 아직 안 열었어도 미매핑 SEND는
   * 버려질 뿐이라 무해하다. 계약 전문은 BY-442.
   */
  const SNAPSHOT_RETRY_INTERVAL_MS = 2000;
  const SNAPSHOT_RETRY_MAX = 5;
  let snapshotReceived = false;
  let snapshotRetriesLeft = 0;
  let snapshotRetryTimer: ReturnType<typeof setTimeout> | null = null;

  function clearSnapshotWatchdog() {
    if (snapshotRetryTimer !== null) {
      clearTimeout(snapshotRetryTimer);
      snapshotRetryTimer = null;
    }
  }

  function requestSnapshot() {
    // send()의 버퍼링을 일부러 쓰지 않는다 — 소켓이 조용히 죽어 status가 open으로 남은
    // 구간(이 채널은 onWebSocketClose를 안 받는다)에 재시도가 pendingFrames로 쌓이면,
    // stompjs 자동 재연결의 flush에서 유령 요청 최대 5개가 한꺼번에 나간다(크로스리뷰 M2).
    // 스냅샷 요청은 연결마다 새로 만드는 값이라 실패는 그냥 버린다 — 재연결 onConnect가
    // 어차피 새 요청을 시작한다.
    try {
      client.publish({ destination: `/app/room/${roomId}/snapshot`, body: "" });
    } catch {
      // 죽은 소켓 구간 — 다음 연결의 정규 요청이 대체한다.
    }
    if (snapshotRetriesLeft <= 0) {
      return;
    }
    snapshotRetriesLeft -= 1;
    snapshotRetryTimer = setTimeout(() => {
      snapshotRetryTimer = null;
      if (!snapshotReceived) {
        requestSnapshot();
      }
    }, SNAPSHOT_RETRY_INTERVAL_MS);
  }

  // 연결 전 발행 버퍼. stompjs는 미연결 publish에서 예외를 던지므로, 연결이 열릴 때까지
  // 쌓아뒀다가 순서대로 내보낸다. 상태·시그널이 프레임 단위로 같은 버퍼를 쓴다.
  const pendingFrames: { destination: string; body: string }[] = [];

  function send(frame: { destination: string; body: string }) {
    if (status !== "open") {
      pendingFrames.push(frame);
      return;
    }
    try {
      client.publish(frame);
    } catch {
      // 소켓이 끊겼지만 onWebSocketClose를 받기 전인 구간 — 다음 연결에서 flush된다.
      pendingFrames.push(frame);
    }
  }

  client.onConnect = () => {
    status = "open";
    // 개인 큐 먼저 구독 — 방 토픽 구독이 입장 확정 트리거라 서버가 SNAPSHOT을
    // 즉시 개인 큐로 보내는데, 큐 구독이 늦으면 유실된다.
    client.subscribe(`/user/queue/room`, handleFrame);
    client.subscribe(`/topic/room/${roomId}`, handleFrame);
    while (pendingFrames.length > 0) {
      const frame = pendingFrames.shift();
      if (frame !== undefined) {
        client.publish(frame);
      }
    }
    // 재연결 포함 연결마다 스냅샷을 직접 요청한다 — 위 워치독 주석(BY-442) 참고.
    snapshotReceived = false;
    clearSnapshotWatchdog();
    snapshotRetriesLeft = SNAPSHOT_RETRY_MAX;
    requestSnapshot();
  };

  return {
    get status() {
      return status;
    },
    connect() {
      status = "connecting";
      client.activate();
    },
    disconnect() {
      status = "closed";
      clearSnapshotWatchdog();
      void client.deactivate();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publishState(message: RoomStateUpdate) {
      send({ destination: `/app/room/${roomId}/state`, body: JSON.stringify(message) });
    },
    publishSignal(message: RoomSignalPublish) {
      send({ destination: `/app/room/${roomId}/signal`, body: JSON.stringify(message) });
    },
  };
}
