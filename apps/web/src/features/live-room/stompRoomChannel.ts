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
      // 배달이 정상임이 증명됐으니 연결 교체 예산을 되채운다 — 다음 유실도 같은 강도로 싸운다.
      snapshotForcedReconnectsLeft = SNAPSHOT_FORCED_RECONNECTS;
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
   * 연결마다 직접 요청하고, 못 받으면 아래 스케줄로 재요청한다: 첫 요청이 같은 레이스에
   * 져도 재시도 시점엔 구독이 확실히 등록돼 있어 자기 치유가 보장된다. 재연결 요청은
   * 끊긴 사이의 멤버 변동 재동기화를 겸한다(중복 SNAPSHOT은 수신측이 멱등 처리 — 리듀서
   * 목록 교체·유예 기준값 최초 1회 채택). BE가 목적지를 아직 안 열었어도 미매핑 SEND는
   * 버려질 뿐이라 무해하다. 계약 전문은 BY-442.
   */
  // 재시도 스케줄 — 유실의 원인인 구독 레이스 창은 ms 단위라 0.5초 뒤 재시도는 충분히
  // 안전하게 늦다. 앞쪽 1~2발을 빠르게 쏴 체감 복구를 당기고(2026-08-26 피드백: 균일
  // 2초는 혼자 화면이 길게 느껴진다), 그래도 안 오면(서버 지연·미배포) 2초로 물러난다.
  const SNAPSHOT_RETRY_DELAYS_MS: readonly number[] = [500, 1000, 2000, 2000, 2000];
  // 빠른 스케줄이 통째로 실패하면 재요청이 아니라 **연결 교체**가 필요한 상황이다 —
  // 5기기 실측(2026-08-26)에서 개인 큐 배달이 1분 넘게 통째로 죽어(스냅샷·offer 전부
  // 미도달) 자연 재연결에야 복구됐다. 재요청은 같은 죽은 세션의 큐로 계속 쏘는 것이라
  // 소용없고, deactivate→activate로 새 STOMP 세션·새 큐 등록을 만들어야 한다. 교체
  // 상한 뒤에도 포기하지 않고 10초 간격 재요청을 무기한 계속한다 — 방이 깨진 상태보다
  // 나쁜 것은 없다(멱등이라 비용은 요청 1개뿐).
  const SNAPSHOT_FORCED_RECONNECTS = 3;
  const SNAPSHOT_SLOW_RETRY_MS = 10_000;
  let snapshotReceived = false;
  let snapshotRetryIndex = 0;
  let snapshotRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let snapshotForcedReconnectsLeft = SNAPSHOT_FORCED_RECONNECTS;

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
    let delay = SNAPSHOT_RETRY_DELAYS_MS[snapshotRetryIndex];
    if (delay !== undefined) {
      snapshotRetryIndex += 1;
    } else if (snapshotForcedReconnectsLeft > 0) {
      // 빠른 스케줄 소진 — 개인 큐가 죽은 세션일 가능성이 높아 연결을 통째로 간다
      // (위 상수 주석). onConnect가 다시 불리며 새 큐 구독 + 새 요청 사이클이 시작된다.
      snapshotForcedReconnectsLeft -= 1;
      void Promise.resolve(client.deactivate()).then(() => {
        // 사용자가 방을 떠났으면(closed) 되살리지 않는다.
        if (status !== "closed") {
          client.activate();
        }
      });
      return;
    } else {
      delay = SNAPSHOT_SLOW_RETRY_MS;
    }
    snapshotRetryTimer = setTimeout(() => {
      snapshotRetryTimer = null;
      if (!snapshotReceived) {
        requestSnapshot();
      }
    }, delay);
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
    snapshotRetryIndex = 0;
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
