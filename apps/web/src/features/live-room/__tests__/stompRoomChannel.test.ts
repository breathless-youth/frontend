import { describe, expect, it, vi } from "vitest";

import type { RoomServerMessage } from "@focusmakers/types";

import type { StompClientLike, StompClientConfig } from "../stompRoomChannel";
import { createStompRoomChannel } from "../stompRoomChannel";

function createFakeClient() {
  const client: StompClientLike & {
    config?: StompClientConfig;
    connected: boolean;
    subscriptions: { destination: string; callback: (frame: { body: string }) => void }[];
    publishes: { destination: string; body: string }[];
    fireConnect: () => void;
  } = {
    onConnect: undefined,
    subscriptions: [],
    publishes: [],
    connected: false,
    activate: vi.fn(),
    deactivate: vi.fn(),
    subscribe(destination, callback) {
      client.subscriptions.push({ destination, callback });
    },
    // 실제 stompjs처럼 미연결 publish는 실패한다 — 버퍼 없이 쏘면 테스트가 잡아낸다.
    publish(params) {
      if (!client.connected) {
        throw new Error("STOMP: not connected");
      }
      client.publishes.push(params);
    },
    fireConnect() {
      client.connected = true;
      client.onConnect?.();
    },
  };
  return client;
}

function setup() {
  const client = createFakeClient();
  const channel = createStompRoomChannel({
    roomId: 42,
    userId: 7,
    createClient: (config) => {
      client.config = config;
      return client;
    },
  });
  return { client, channel };
}

/** 연결마다 자동 발신되는 SNAPSHOT 재요청(BY-442)을 걷어낸 발행 목록 — 발행 API 검증용. */
function appPublishes(client: ReturnType<typeof createFakeClient>) {
  return client.publishes.filter((p) => !p.destination.endsWith("/snapshot"));
}

/** SNAPSHOT 재요청 발신만 추린다. */
function snapshotRequests(client: ReturnType<typeof createFakeClient>) {
  return client.publishes.filter((p) => p.destination === "/app/room/42/snapshot");
}

describe("createStompRoomChannel", () => {
  it("연결 URL에 userId를 싣고, 연결되면 방 토픽과 개인 큐 2곳을 구독한다", () => {
    const { client, channel } = setup();

    channel.connect();
    expect(client.activate).toHaveBeenCalledTimes(1);
    expect(client.config?.brokerURL).toMatch(/\/ws\?userId=7$/);
    expect(client.config?.brokerURL).toMatch(/^wss?:/);

    client.fireConnect();
    // 개인 큐를 먼저 구독한다 — 방 토픽 구독이 입장 확정 트리거라 서버가 SNAPSHOT을
    // 즉시 개인 큐로 보내는데, 큐 구독이 늦으면 유실된다(로컬 BE 통합 검증에서 실측).
    expect(client.subscriptions.map((s) => s.destination)).toEqual([
      "/user/queue/room",
      "/topic/room/42",
    ]);
    expect(channel.status).toBe("open");
  });

  it("재연결되면 다시 구독한다 — stompjs는 구독을 복원하지 않는다", () => {
    const { client, channel } = setup();
    channel.connect();

    client.fireConnect();
    client.onConnect?.();

    expect(client.subscriptions).toHaveLength(4);
  });

  it("수신 프레임의 JSON 본문을 구독자에게 전달하고, 깨진 본문은 무시한다", () => {
    const { client, channel } = setup();
    const received: RoomServerMessage[] = [];
    channel.subscribe((message) => received.push(message));
    channel.connect();
    client.fireConnect();

    client.subscriptions[0]?.callback({ body: '{"type":"MEMBER_LEFT","userId":7}' });
    client.subscriptions[0]?.callback({ body: "not-json" });

    expect(received).toEqual([{ type: "MEMBER_LEFT", userId: 7 }]);
  });

  it("유효한 JSON이어도 계약에 없는 타입·필드는 무시한다 — 리듀서가 undefined를 받지 않는다", () => {
    const { client, channel } = setup();
    const received: RoomServerMessage[] = [];
    channel.subscribe((message) => received.push(message));
    channel.connect();
    client.fireConnect();

    client.subscriptions[0]?.callback({ body: "{}" });
    client.subscriptions[0]?.callback({ body: '{"type":"UNKNOWN"}' });
    client.subscriptions[0]?.callback({ body: '{"type":"MEMBER_LEFT"}' });
    client.subscriptions[0]?.callback({ body: '{"type":"SNAPSHOT","members":"oops"}' });

    expect(received).toEqual([]);
  });

  it("멤버 필드가 스펙에 안 맞는 SNAPSHOT·MEMBER_JOINED는 통째로 버린다 — 타일 렌더 크래시 방지", () => {
    const { client, channel } = setup();
    const received: RoomServerMessage[] = [];
    channel.subscribe((message) => received.push(message));
    channel.connect();
    client.fireConnect();

    client.subscriptions[0]?.callback({ body: '{"type":"SNAPSHOT","members":[{}]}' });
    client.subscriptions[0]?.callback({ body: '{"type":"MEMBER_JOINED","member":{}}' });
    client.subscriptions[0]?.callback({
      body: '{"type":"MEMBER_JOINED","member":{"userId":8,"nickname":8,"cameraOn":true,"focusState":"FOCUS","studySeconds":0}}',
    });

    expect(received).toEqual([]);
  });

  it("BE 실 스펙의 3필드 멤버를 통과시킨다 — nickname 등은 없어도 된다", () => {
    const { client, channel } = setup();
    const received: RoomServerMessage[] = [];
    channel.subscribe((message) => received.push(message));
    channel.connect();
    client.fireConnect();

    client.subscriptions[0]?.callback({
      body: '{"type":"SNAPSHOT","members":[{"userId":8,"cameraOn":true,"focusState":"FOCUS"}]}',
    });
    client.subscriptions[0]?.callback({
      body: '{"type":"MEMBER_JOINED","member":{"userId":9,"cameraOn":false,"focusState":"FOCUS","nickname":"포메1","goal":null,"studySeconds":30}}',
    });

    expect(received).toHaveLength(2);
  });

  it("focusState가 계약 밖 값이면 멤버 메시지와 FOCUS_CHANGED를 버린다", () => {
    const { client, channel } = setup();
    const received: RoomServerMessage[] = [];
    channel.subscribe((message) => received.push(message));
    channel.connect();
    client.fireConnect();

    client.subscriptions[0]?.callback({
      body: '{"type":"MEMBER_JOINED","member":{"userId":8,"cameraOn":true,"focusState":"NAPPING"}}',
    });
    client.subscriptions[0]?.callback({
      body: '{"type":"FOCUS_CHANGED","userId":8,"focusState":"NAPPING"}',
    });
    client.subscriptions[0]?.callback({
      body: '{"type":"MEMBER_JOINED","member":{"userId":8,"cameraOn":true,"focusState":"FOCUS","goal":123}}',
    });

    expect(received).toEqual([]);
  });

  it("SIGNAL은 fromUserId·kind·payload가 있어야 통과한다", () => {
    const { client, channel } = setup();
    const received: RoomServerMessage[] = [];
    channel.subscribe((message) => received.push(message));
    channel.connect();
    client.fireConnect();

    client.subscriptions[0]?.callback({
      body: '{"type":"SIGNAL","fromUserId":8,"kind":"OFFER","payload":{"type":"offer","sdp":"v=0"}}',
    });
    client.subscriptions[0]?.callback({ body: '{"type":"SIGNAL","kind":"OFFER","payload":{}}' });
    client.subscriptions[0]?.callback({
      body: '{"type":"SIGNAL","fromUserId":8,"kind":"NOPE","payload":{}}',
    });

    expect(received).toEqual([
      { type: "SIGNAL", fromUserId: 8, kind: "OFFER", payload: { type: "offer", sdp: "v=0" } },
    ]);
  });

  it("publishState는 방 상태 목적지로 JSON을 발행한다", () => {
    const { client, channel } = setup();
    channel.connect();
    client.fireConnect();

    channel.publishState({ studySeconds: 12360 });

    expect(appPublishes(client)).toEqual([
      { destination: "/app/room/42/state", body: '{"studySeconds":12360}' },
    ]);
  });

  it("연결 전 발행은 버퍼에 쌓였다가 연결되면 순서대로 나간다", () => {
    const { client, channel } = setup();
    channel.connect();

    channel.publishState({ cameraOn: false });
    channel.publishState({ studySeconds: 0 });
    expect(client.publishes).toEqual([]);

    client.fireConnect();

    expect(appPublishes(client).map((p) => p.body)).toEqual([
      '{"cameraOn":false}',
      '{"studySeconds":0}',
    ]);
  });

  it("재연결 끊김 구간의 발행은 실패를 삼키고 다음 연결에서 다시 나간다", () => {
    const { client, channel } = setup();
    channel.connect();
    client.fireConnect();

    client.connected = false; // 소켓이 끊겼지만 채널은 아직 모르는 구간
    channel.publishState({ studySeconds: 60 });
    expect(appPublishes(client)).toEqual([]);

    client.fireConnect();

    expect(appPublishes(client).map((p) => p.body)).toEqual(['{"studySeconds":60}']);
  });

  it("publishSignal은 시그널 목적지로 발행하고, 연결 전에는 버퍼에 쌓인다", () => {
    const { client, channel } = setup();
    channel.connect();
    channel.publishSignal({ toUserId: 9, kind: "OFFER", payload: { type: "offer", sdp: "v=0" } });
    expect(client.publishes).toEqual([]);

    client.fireConnect();

    expect(appPublishes(client)).toEqual([
      {
        destination: "/app/room/42/signal",
        body: '{"toUserId":9,"kind":"OFFER","payload":{"type":"offer","sdp":"v=0"}}',
      },
    ]);
  });

  it("disconnect는 클라이언트를 종료하고 상태를 closed로 바꾼다", () => {
    const { client, channel } = setup();
    channel.connect();

    channel.disconnect();

    expect(client.deactivate).toHaveBeenCalledTimes(1);
    expect(channel.status).toBe("closed");
  });
});

/**
 * SNAPSHOT 재요청 워치독(BY-442) — 서버의 구독 트리거 SNAPSHOT이 인바운드 처리 순서
 * 레이스로 유실될 수 있어(개인 큐 등록 전 발사), 연결마다 직접 요청하고 못 받으면
 * 재요청한다. 계약 전문은 BY-442 티켓.
 */
describe("SNAPSHOT 재요청 워치독 (BY-442)", () => {
  it("연결되면 구독 직후 빈 본문으로 재요청을 1회 보내고, 재연결에도 다시 보낸다", () => {
    const { client, channel } = setup();
    channel.connect();
    client.fireConnect();

    expect(snapshotRequests(client)).toHaveLength(1);
    expect(snapshotRequests(client)[0]?.body).toBe("");

    // 재연결 — stompjs는 onConnect를 다시 부른다. 끊긴 사이 멤버 변동 재동기화를 겸한다.
    client.fireConnect();
    expect(snapshotRequests(client)).toHaveLength(2);
  });

  it("SNAPSHOT 미수신이면 2초 간격으로 재요청하고, 최초 1회+재시도 5회에서 멈춘다", () => {
    vi.useFakeTimers();
    try {
      const { client, channel } = setup();
      channel.connect();
      client.fireConnect();
      expect(snapshotRequests(client)).toHaveLength(1);

      vi.advanceTimersByTime(2000);
      expect(snapshotRequests(client)).toHaveLength(2);

      vi.advanceTimersByTime(20_000);
      expect(snapshotRequests(client)).toHaveLength(6);
      vi.advanceTimersByTime(20_000);
      expect(snapshotRequests(client)).toHaveLength(6);
    } finally {
      vi.useRealTimers();
    }
  });

  it("계약을 통과한 SNAPSHOT을 받으면 재요청을 멈춘다", () => {
    vi.useFakeTimers();
    try {
      const { client, channel } = setup();
      channel.connect();
      client.fireConnect();

      client.subscriptions[0]?.callback({ body: '{"type":"SNAPSHOT","members":[]}' });
      vi.advanceTimersByTime(20_000);

      expect(snapshotRequests(client)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("계약에 안 맞는 SNAPSHOT은 도착으로 치지 않는다 — 워치독이 계속 재요청한다", () => {
    vi.useFakeTimers();
    try {
      const { client, channel } = setup();
      channel.connect();
      client.fireConnect();

      client.subscriptions[0]?.callback({ body: '{"type":"SNAPSHOT","members":"oops"}' });
      vi.advanceTimersByTime(2000);

      expect(snapshotRequests(client)).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("소켓이 조용히 죽은 구간의 재시도는 버퍼에 남지 않는다 — 재연결 flush에 유령 요청이 없다", () => {
    // 이 채널은 onWebSocketClose를 받지 않아 소켓이 죽어도 status가 open으로 남는다 —
    // 그 구간의 재시도가 send() 버퍼로 쌓이면 stompjs 자동 재연결의 flush에서 유령 요청
    // 최대 5개가 한꺼번에 나간다(크로스리뷰 M2). 재시도 실패는 버퍼링 없이 버려야 한다.
    vi.useFakeTimers();
    try {
      const { client, channel } = setup();
      channel.connect();
      client.fireConnect();
      expect(snapshotRequests(client)).toHaveLength(1);

      client.connected = false; // 소켓만 죽고 채널은 모르는 구간
      vi.advanceTimersByTime(20_000); // 재시도 5회 전부 publish 실패

      client.fireConnect(); // stompjs 자동 재연결
      // 새 연결의 정규 요청 1회만 — 실패한 재시도들이 버퍼로 되살아나지 않는다.
      expect(snapshotRequests(client)).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("disconnect는 워치독을 멈춘다 — 다음 연결에서 유령 재요청이 흘러나오지 않는다", () => {
    vi.useFakeTimers();
    try {
      const { client, channel } = setup();
      channel.connect();
      client.fireConnect();
      expect(snapshotRequests(client)).toHaveLength(1);

      channel.disconnect();
      vi.advanceTimersByTime(20_000);

      // 재연결하면 새 연결의 1회만 나간다 — 죽은 워치독이 버퍼로 흘려보낸 발행이 없다.
      client.fireConnect();
      expect(snapshotRequests(client)).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
