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

describe("createStompRoomChannel", () => {
  it("연결 URL에 userId를 싣고, 연결되면 방 토픽과 개인 큐 2곳을 구독한다", () => {
    const { client, channel } = setup();

    channel.connect();
    expect(client.activate).toHaveBeenCalledTimes(1);
    expect(client.config?.brokerURL).toMatch(/\/ws\?userId=7$/);
    expect(client.config?.brokerURL).toMatch(/^wss?:/);

    client.fireConnect();
    expect(client.subscriptions.map((s) => s.destination)).toEqual([
      "/topic/room/42",
      "/user/queue/room",
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

  it("멤버 필드가 계약에 안 맞는 SNAPSHOT·MEMBER_JOINED는 통째로 버린다 — 타일 렌더 크래시 방지", () => {
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

  it("publishState는 방 상태 목적지로 JSON을 발행한다", () => {
    const { client, channel } = setup();
    channel.connect();
    client.fireConnect();

    channel.publishState({ type: "STUDY_TIME", studySeconds: 12360 });

    expect(client.publishes).toEqual([
      { destination: "/app/room/42/state", body: '{"type":"STUDY_TIME","studySeconds":12360}' },
    ]);
  });

  it("연결 전 발행은 버퍼에 쌓였다가 연결되면 순서대로 나간다", () => {
    const { client, channel } = setup();
    channel.connect();

    channel.publishState({ type: "CAMERA_CHANGED", cameraOn: false });
    channel.publishState({ type: "STUDY_TIME", studySeconds: 0 });
    expect(client.publishes).toEqual([]);

    client.fireConnect();

    expect(client.publishes.map((p) => p.body)).toEqual([
      '{"type":"CAMERA_CHANGED","cameraOn":false}',
      '{"type":"STUDY_TIME","studySeconds":0}',
    ]);
  });

  it("재연결 끊김 구간의 발행은 실패를 삼키고 다음 연결에서 다시 나간다", () => {
    const { client, channel } = setup();
    channel.connect();
    client.fireConnect();

    client.connected = false; // 소켓이 끊겼지만 채널은 아직 모르는 구간
    channel.publishState({ type: "STUDY_TIME", studySeconds: 60 });
    expect(client.publishes).toEqual([]);

    client.fireConnect();

    expect(client.publishes.map((p) => p.body)).toEqual([
      '{"type":"STUDY_TIME","studySeconds":60}',
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
