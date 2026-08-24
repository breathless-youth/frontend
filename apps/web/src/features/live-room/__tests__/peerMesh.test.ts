import { describe, expect, it, vi } from "vitest";

import type { RoomMember } from "@focusmakers/types";

import { createMockRoomChannel } from "../mockRoomChannel";
import { createPeerMesh } from "../peerMesh";

type FakeSender = {
  track: MediaStreamTrack | null;
  replaceTrack: ReturnType<typeof vi.fn>;
  setParameters: ReturnType<typeof vi.fn>;
  getParameters: () => RTCRtpSendParameters;
};

function createFakePc() {
  const pc = {
    localDescription: null as RTCSessionDescriptionInit | null,
    remoteDescription: null as RTCSessionDescriptionInit | null,
    candidates: [] as unknown[],
    senders: [] as FakeSender[],
    closed: false,
    iceConnectionState: "new" as RTCIceConnectionState,
    onicecandidate: null as ((e: { candidate: unknown }) => void) | null,
    ontrack: null as ((e: { streams: MediaStream[]; track?: MediaStreamTrack }) => void) | null,
    oniceconnectionstatechange: null as (() => void) | null,
    restartIce: vi.fn(),
    async createOffer() {
      return { type: "offer", sdp: "offer-sdp" } as RTCSessionDescriptionInit;
    },
    async createAnswer() {
      return { type: "answer", sdp: "answer-sdp" } as RTCSessionDescriptionInit;
    },
    async setLocalDescription(d: RTCSessionDescriptionInit) {
      pc.localDescription = d;
    },
    async setRemoteDescription(d: RTCSessionDescriptionInit) {
      pc.remoteDescription = d;
    },
    async addIceCandidate(c: unknown) {
      pc.candidates.push(c);
    },
    addTrack(track: MediaStreamTrack) {
      const sender: FakeSender = {
        track,
        replaceTrack: vi.fn(async () => undefined),
        setParameters: vi.fn(async () => undefined),
        getParameters: () => ({ encodings: [{}] }) as RTCRtpSendParameters,
      };
      pc.senders.push(sender);
      return sender;
    },
    getSenders() {
      return pc.senders;
    },
    transceivers: [] as { sender: FakeSender; setCodecPreferences: ReturnType<typeof vi.fn> }[],
    getTransceivers() {
      return pc.transceivers;
    },
    addTransceiver(_kind: string) {
      const sender: FakeSender = {
        track: null,
        replaceTrack: vi.fn(async () => undefined),
        setParameters: vi.fn(async () => undefined),
        getParameters: () => ({ encodings: [{}] }) as RTCRtpSendParameters,
      };
      pc.senders.push(sender);
      const transceiver = { sender, setCodecPreferences: vi.fn() };
      pc.transceivers.push(transceiver);
      return transceiver;
    },
    close() {
      pc.closed = true;
    },
    fireIceState(state: RTCIceConnectionState) {
      pc.iceConnectionState = state;
      pc.oniceconnectionstatechange?.();
    },
  };
  return pc;
}

type FakePc = ReturnType<typeof createFakePc>;

function member(userId: number): RoomMember {
  return { userId, cameraOn: true, focusState: "FOCUS" };
}

function fakeTrack(height?: number): MediaStreamTrack {
  return {
    enabled: true,
    muted: false,
    readyState: "live",
    getSettings: () => (height === undefined ? {} : { height }),
  } as unknown as MediaStreamTrack;
}

function fakeStream(track: MediaStreamTrack): MediaStream {
  return { getVideoTracks: () => [track] } as unknown as MediaStream;
}

function setup(options: { myUserId?: number; onEvent?: (line: string) => void } = {}) {
  const channel = createMockRoomChannel({ snapshot: [] });
  const pcs: { config: RTCConfiguration; pc: FakePc }[] = [];
  const mesh = createPeerMesh({
    myUserId: options.myUserId ?? 7,
    channel,
    iceServers: [{ urls: ["stun:turn.example:3478"] }],
    createPeerConnection: (config) => {
      const pc = createFakePc();
      pcs.push({ config, pc });
      return pc as unknown as RTCPeerConnection;
    },
    onEvent: options.onEvent,
  });
  mesh.start();
  return { channel, mesh, pcs };
}

describe("createPeerMesh — 수명", () => {
  it("start 전에는 채널 메시지에 반응하지 않는다 — StrictMode 이중 생성의 유령 방지", async () => {
    const channel = createMockRoomChannel({ snapshot: [] });
    const pcs: unknown[] = [];
    createPeerMesh({
      myUserId: 7,
      channel,
      iceServers: [],
      createPeerConnection: () => {
        pcs.push(1);
        return createFakePc() as unknown as RTCPeerConnection;
      },
    });

    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(pcs).toHaveLength(0);
    expect(channel.publishedSignals).toEqual([]);
  });

  it("close 후 다시 start하면 재동작한다 — StrictMode 마운트-해제-재마운트", async () => {
    const { channel, mesh, pcs } = setup();
    mesh.close();
    mesh.start();

    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });

    await vi.waitFor(() => {
      expect(channel.publishedSignals.map((s) => s.kind)).toEqual(["OFFER"]);
    });
    expect(pcs).toHaveLength(1);
  });
});

describe("createPeerMesh — 연결 수립", () => {
  it("SNAPSHOT을 받으면 본인을 제외한 전원에게 PC를 만들고 OFFER를 발행한다", async () => {
    const { channel, pcs } = setup({ myUserId: 7 });

    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8), member(9)] });

    await vi.waitFor(() => {
      expect(channel.publishedSignals.map((s) => s.toUserId)).toEqual([8, 9]);
    });
    expect(channel.publishedSignals.every((s) => s.kind === "OFFER")).toBe(true);
    expect(pcs).toHaveLength(2);
    expect(pcs[0]?.config.iceServers).toEqual([{ urls: ["stun:turn.example:3478"] }]);
  });

  it("SNAPSHOT에 이미 연결된 상대가 있으면 그 상대는 건너뛴다 — 재구독 재전송 대비", async () => {
    const { channel, pcs } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(channel.publishedSignals).toHaveLength(1));

    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8), member(9)] });

    await vi.waitFor(() => expect(channel.publishedSignals).toHaveLength(2));
    expect(channel.publishedSignals.map((s) => s.toUserId)).toEqual([8, 9]);
    expect(pcs).toHaveLength(2);
  });

  it("MEMBER_JOINED에는 offer를 만들지 않는다 — 신규 입장자가 offer를 만든다", async () => {
    const { channel, pcs } = setup();

    channel.emitServerMessage({ type: "MEMBER_JOINED", member: member(8) });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(channel.publishedSignals).toEqual([]);
    expect(pcs).toHaveLength(0);
  });

  it("SIGNAL OFFER를 받으면 PC를 만들어 remote 설정 후 ANSWER를 발행한다", async () => {
    const { channel, pcs } = setup();

    channel.emitServerMessage({
      type: "SIGNAL",
      fromUserId: 8,
      kind: "OFFER",
      payload: { type: "offer", sdp: "from-8" },
    });

    await vi.waitFor(() => {
      expect(channel.publishedSignals).toEqual([
        { toUserId: 8, kind: "ANSWER", payload: { type: "answer", sdp: "answer-sdp" } },
      ]);
    });
    expect(pcs[0]?.pc.remoteDescription).toEqual({ type: "offer", sdp: "from-8" });
    expect(pcs[0]?.pc.localDescription).toEqual({ type: "answer", sdp: "answer-sdp" });
  });

  it("SIGNAL ANSWER를 받으면 해당 PC의 remote로 설정한다", async () => {
    const { channel, pcs } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(channel.publishedSignals).toHaveLength(1));

    channel.emitServerMessage({
      type: "SIGNAL",
      fromUserId: 8,
      kind: "ANSWER",
      payload: { type: "answer", sdp: "from-8" },
    });

    await vi.waitFor(() => {
      expect(pcs[0]?.pc.remoteDescription).toEqual({ type: "answer", sdp: "from-8" });
    });
  });

  it("SIGNAL CANDIDATE를 받으면 addIceCandidate로 넘긴다", async () => {
    const { channel, pcs } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(channel.publishedSignals).toHaveLength(1));

    channel.emitServerMessage({
      type: "SIGNAL",
      fromUserId: 8,
      kind: "CANDIDATE",
      payload: { candidate: "c1" },
    });

    await vi.waitFor(() => {
      expect(pcs[0]?.pc.candidates).toEqual([{ candidate: "c1" }]);
    });
  });
});

describe("createPeerMesh — 트랙과 품질", () => {
  it("로컬 스트림을 설정하면 각 PC에 addTrack되고 240p·15fps·200kbps가 걸린다", async () => {
    const { channel, mesh, pcs } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));

    mesh.setLocalStream(fakeStream(fakeTrack(720)));

    const sender = pcs[0]?.pc.senders[0];
    expect(sender).toBeDefined();
    expect(sender?.setParameters).toHaveBeenCalledWith(
      expect.objectContaining({
        encodings: [
          expect.objectContaining({
            maxBitrate: 200_000,
            maxFramerate: 15,
            scaleResolutionDownBy: 3,
          }),
        ],
      }),
    );
  });

  it("이미 sender가 있으면 replaceTrack으로 교체한다 — 재협상 없음", async () => {
    const { channel, mesh, pcs } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    mesh.setLocalStream(fakeStream(fakeTrack(720)));

    const next = fakeTrack(480);
    mesh.setLocalStream(fakeStream(next));

    const sender = pcs[0]?.pc.senders[0];
    expect(pcs[0]?.pc.senders).toHaveLength(1);
    expect(sender?.replaceTrack).toHaveBeenCalledWith(next);
  });

  it("스트림 준비 전에 만든 연결에도 송신 슬롯이 예약되어, 나중 스트림이 replaceTrack으로 붙는다", async () => {
    const { channel, mesh, pcs } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    expect(pcs[0]?.pc.senders).toHaveLength(1);

    const track = fakeTrack(720);
    mesh.setLocalStream(fakeStream(track));

    const sender = pcs[0]?.pc.senders[0];
    expect(pcs[0]?.pc.senders).toHaveLength(1);
    expect(sender?.replaceTrack).toHaveBeenCalledWith(track);
  });

  it("스트림이 설정된 뒤 만들어지는 PC에도 트랙이 붙는다", async () => {
    const { channel, mesh, pcs } = setup();
    mesh.setLocalStream(fakeStream(fakeTrack(720)));

    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });

    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    expect(pcs[0]?.pc.senders).toHaveLength(1);
  });

  it("setTrackEnabled(false)는 송신 트랙의 enabled만 끈다 — 연결은 유지", async () => {
    const { channel, mesh, pcs } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    const track = fakeTrack(720);
    mesh.setLocalStream(fakeStream(track));

    mesh.setTrackEnabled(false);

    expect(track.enabled).toBe(false);
    expect(pcs[0]?.pc.closed).toBe(false);
  });

  it("muted 트랙은 실제 프레임이 흐르기 시작할 때(unmute)만 통지한다 — 연결 안 된 상대는 아바타 유지", async () => {
    const { channel, pcs, mesh } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    const received: [number, MediaStream | null][] = [];
    mesh.subscribeRemoteStreams((userId, stream) => received.push([userId, stream]));

    const mutedTrack = {
      enabled: true,
      muted: true,
      onunmute: null as (() => void) | null,
    } as unknown as MediaStreamTrack;
    const remote = fakeStream(mutedTrack);
    pcs[0]?.pc.ontrack?.({ streams: [remote], track: mutedTrack });

    expect(received).toEqual([]);

    (mutedTrack as unknown as { muted: boolean; onunmute: (() => void) | null }).muted = false;
    (mutedTrack as unknown as { onunmute: (() => void) | null }).onunmute?.();

    expect(received).toEqual([[8, remote]]);
  });

  it("송신 코덱을 VP8 우선으로 협상한다 — 기기별 하드웨어 인코더 편차 회피", async () => {
    vi.stubGlobal("RTCRtpSender", {
      getCapabilities: () => ({
        codecs: [{ mimeType: "video/H264" }, { mimeType: "video/VP8" }],
      }),
    });
    try {
      const { channel, pcs } = setup();
      channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
      await vi.waitFor(() => expect(pcs).toHaveLength(1));

      const setPrefs = pcs[0]?.pc.transceivers[0]?.setCodecPreferences;
      expect(setPrefs).toHaveBeenCalledTimes(1);
      const ordered = setPrefs?.mock.calls[0]?.[0] as { mimeType: string }[];
      expect(ordered[0]?.mimeType).toBe("video/VP8");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("answerer가 카메라 없이 받은 offer의 송신 슬롯에 뒤늦은 트랙이 실린다", async () => {
    const { channel, pcs, mesh } = setup();
    channel.emitServerMessage({
      type: "SIGNAL",
      fromUserId: 8,
      kind: "OFFER",
      payload: { type: "offer", sdp: "from-8" },
    });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    expect(pcs[0]?.pc.senders[0]?.track).toBeNull();

    const track = fakeTrack(720);
    mesh.setLocalStream(fakeStream(track));

    expect(pcs[0]?.pc.senders[0]?.replaceTrack).toHaveBeenCalledWith(track);
  });

  it("수신 트랙이 mute되면 스트림 null을 통지한다 — 프레임 끊긴 상대는 아바타로 전환", async () => {
    const { channel, pcs, mesh } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    const received: [number, MediaStream | null][] = [];
    mesh.subscribeRemoteStreams((userId, stream) => received.push([userId, stream]));

    const track = {
      enabled: true,
      muted: false,
      onmute: null as (() => void) | null,
    } as unknown as MediaStreamTrack;
    const remote = fakeStream(track);
    pcs[0]?.pc.ontrack?.({ streams: [remote], track });
    expect(received).toEqual([[8, remote]]);

    (track as unknown as { onmute: (() => void) | null }).onmute?.();

    expect(received).toEqual([
      [8, remote],
      [8, null],
    ]);
  });

  it("mute 뒤 다시 unmute되면 스트림을 재통지한다 — 일시 끊김 회복", async () => {
    const { channel, pcs, mesh } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    const received: [number, MediaStream | null][] = [];
    mesh.subscribeRemoteStreams((userId, stream) => received.push([userId, stream]));

    const track = {
      enabled: true,
      muted: false,
      onmute: null as (() => void) | null,
      onunmute: null as (() => void) | null,
    } as unknown as MediaStreamTrack;
    const remote = fakeStream(track);
    pcs[0]?.pc.ontrack?.({ streams: [remote], track });
    (track as unknown as { onmute: (() => void) | null }).onmute?.();
    (track as unknown as { onunmute: (() => void) | null }).onunmute?.();

    expect(received).toEqual([
      [8, remote],
      [8, null],
      [8, remote],
    ]);
  });

  it("수신 트랙이 ended되면 스트림 null을 통지한다", async () => {
    const { channel, pcs, mesh } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    const received: [number, MediaStream | null][] = [];
    mesh.subscribeRemoteStreams((userId, stream) => received.push([userId, stream]));

    const track = {
      enabled: true,
      muted: false,
      onended: null as (() => void) | null,
    } as unknown as MediaStreamTrack;
    const remote = fakeStream(track);
    pcs[0]?.pc.ontrack?.({ streams: [remote], track });
    (track as unknown as { onended: (() => void) | null }).onended?.();

    expect(received).toEqual([
      [8, remote],
      [8, null],
    ]);
  });

  it("streams가 빈 ontrack도 트랙으로 스트림을 만들어 통지한다 — 송신 슬롯 예약 경로", async () => {
    class FakeMediaStream {
      tracks: MediaStreamTrack[];
      constructor(tracks: MediaStreamTrack[]) {
        this.tracks = tracks;
      }
      getVideoTracks() {
        return this.tracks;
      }
    }
    vi.stubGlobal("MediaStream", FakeMediaStream);
    try {
      const { channel, pcs, mesh } = setup();
      channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
      await vi.waitFor(() => expect(pcs).toHaveLength(1));
      const received: [number, MediaStream | null][] = [];
      mesh.subscribeRemoteStreams((userId, stream) => received.push([userId, stream]));

      const bareTrack = fakeTrack();
      pcs[0]?.pc.ontrack?.({ streams: [], track: bareTrack });

      expect(received).toHaveLength(1);
      expect(received[0]?.[0]).toBe(8);
      expect(received[0]?.[1]?.getVideoTracks()).toEqual([bareTrack]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("ontrack으로 받은 스트림이 userId와 함께 리스너에 전달되고, 해지 후에는 오지 않는다", async () => {
    const { channel, pcs, mesh } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    const received: [number, MediaStream | null][] = [];
    const unsubscribe = mesh.subscribeRemoteStreams((userId, stream) => {
      received.push([userId, stream]);
    });

    const remote = fakeStream(fakeTrack());
    pcs[0]?.pc.ontrack?.({ streams: [remote] });
    unsubscribe();
    pcs[0]?.pc.ontrack?.({ streams: [remote] });

    expect(received).toEqual([[8, remote]]);
  });
});

describe("createPeerMesh — 정리와 실패", () => {
  it("MEMBER_LEFT를 받으면 그 PC를 닫고 수신 스트림 null을 통지한다", async () => {
    const { channel, pcs, mesh } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    const received: [number, MediaStream | null][] = [];
    mesh.subscribeRemoteStreams((userId, stream) => received.push([userId, stream]));

    channel.emitServerMessage({ type: "MEMBER_LEFT", userId: 8 });

    expect(pcs[0]?.pc.closed).toBe(true);
    expect(received).toEqual([[8, null]]);
  });

  it("ICE connected 시 선택된 후보 쌍 종류를 디버그로 알린다 — TURN 경유 여부 판별", async () => {
    const lines: string[] = [];
    const { channel, pcs } = setup({ onEvent: (line) => lines.push(line) });
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));

    const stats = new Map<string, Record<string, unknown>>([
      ["T", { id: "T", type: "transport", selectedCandidatePairId: "P" }],
      ["P", { id: "P", type: "candidate-pair", localCandidateId: "L" }],
      ["L", { id: "L", type: "local-candidate", candidateType: "relay" }],
    ]);
    (pcs[0]!.pc as unknown as { getStats: () => Promise<unknown> }).getStats = () =>
      Promise.resolve(stats);
    pcs[0]?.pc.fireIceState("connected");

    await vi.waitFor(() => {
      expect(lines).toContain("path 8: relay");
    });
  });

  it("iceConnectionState disconnected면 스트림 null을 통지한다 — 끊긴 상대는 아바타", async () => {
    const { channel, pcs, mesh } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    const received: [number, MediaStream | null][] = [];
    mesh.subscribeRemoteStreams((userId, stream) => received.push([userId, stream]));

    const remote = fakeStream(fakeTrack());
    pcs[0]?.pc.ontrack?.({ streams: [remote] });
    pcs[0]?.pc.fireIceState("disconnected");

    expect(received).toEqual([
      [8, remote],
      [8, null],
    ]);
  });

  it("disconnected 후 connected로 복귀하면 마지막 스트림을 재통지한다", async () => {
    const { channel, pcs, mesh } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    const received: [number, MediaStream | null][] = [];
    mesh.subscribeRemoteStreams((userId, stream) => received.push([userId, stream]));

    const remote = fakeStream(fakeTrack());
    pcs[0]?.pc.ontrack?.({ streams: [remote] });
    pcs[0]?.pc.fireIceState("disconnected");
    pcs[0]?.pc.fireIceState("connected");

    expect(received).toEqual([
      [8, remote],
      [8, null],
      [8, remote],
    ]);
  });

  it("offerer는 첫 failed에 ICE restart 재협상 OFFER를 발행한다", async () => {
    const { channel, pcs } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(channel.publishedSignals).toHaveLength(1));

    pcs[0]?.pc.fireIceState("failed");

    expect(pcs[0]?.pc.restartIce).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(channel.publishedSignals.filter((s) => s.kind === "OFFER")).toHaveLength(2);
    });
  });

  it("answerer는 failed에 재협상 OFFER를 만들지 않고 아바타로 내린다 — 재시작은 offerer 몫", async () => {
    const { channel, pcs, mesh } = setup();
    channel.emitServerMessage({
      type: "SIGNAL",
      fromUserId: 8,
      kind: "OFFER",
      payload: { type: "offer", sdp: "from-8" },
    });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    const received: [number, MediaStream | null][] = [];
    mesh.subscribeRemoteStreams((userId, stream) => received.push([userId, stream]));

    pcs[0]?.pc.fireIceState("failed");

    expect(received).toEqual([[8, null]]);
    expect(channel.publishedSignals.filter((s) => s.kind === "OFFER")).toHaveLength(0);
  });

  it("ended 후 ICE connected가 돼도 종료된 스트림을 되살리지 않는다", async () => {
    const { channel, pcs, mesh } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    const received: [number, MediaStream | null][] = [];
    mesh.subscribeRemoteStreams((userId, stream) => received.push([userId, stream]));

    const track = fakeTrack();
    const remote = fakeStream(track);
    pcs[0]?.pc.ontrack?.({ streams: [remote], track });
    (track as unknown as { onended: (() => void) | null }).onended?.();
    pcs[0]?.pc.fireIceState("connected");

    expect(received).toEqual([
      [8, remote],
      [8, null],
    ]);
  });

  it("복귀 시 트랙이 muted면 재통지하지 않는다 — 복원은 unmute가 맡는다", async () => {
    const { channel, pcs, mesh } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    const received: [number, MediaStream | null][] = [];
    mesh.subscribeRemoteStreams((userId, stream) => received.push([userId, stream]));

    const track = fakeTrack() as unknown as {
      muted: boolean;
      onmute: (() => void) | null;
      onunmute: (() => void) | null;
    };
    const remote = fakeStream(track as unknown as MediaStreamTrack);
    pcs[0]?.pc.ontrack?.({ streams: [remote], track: track as unknown as MediaStreamTrack });
    track.muted = true;
    track.onmute?.();
    pcs[0]?.pc.fireIceState("disconnected");
    pcs[0]?.pc.fireIceState("connected");

    expect(received).toEqual([
      [8, remote],
      [8, null],
      [8, null],
    ]);

    track.muted = false;
    track.onunmute?.();
    expect(received[received.length - 1]).toEqual([8, remote]);
  });

  it("SDP 적용이 끝나기 전에 온 CANDIDATE는 적용 완료를 기다린다 — 상대별 순서 보장", async () => {
    const { channel, pcs } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));

    const order: string[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    pcs[0]!.pc.setRemoteDescription = async (d: RTCSessionDescriptionInit) => {
      order.push("sdp-start");
      await gate;
      order.push("sdp-done");
      pcs[0]!.pc.remoteDescription = d;
    };
    pcs[0]!.pc.addIceCandidate = async () => {
      order.push("candidate");
    };

    channel.emitServerMessage({
      type: "SIGNAL",
      fromUserId: 8,
      kind: "ANSWER",
      payload: { type: "answer", sdp: "a" },
    });
    channel.emitServerMessage({ type: "SIGNAL", fromUserId: 8, kind: "CANDIDATE", payload: {} });
    await new Promise((resolve) => setTimeout(resolve, 10));
    release?.();

    await vi.waitFor(() => {
      expect(order).toEqual(["sdp-start", "sdp-done", "candidate"]);
    });
  });

  it("OFFER 생성이 실패하면 그 상대만 아바타로 내리고 다른 연결은 계속한다", async () => {
    const channel = createMockRoomChannel({ snapshot: [] });
    const pcs: FakePc[] = [];
    let first = true;
    const received: [number, MediaStream | null][] = [];
    const mesh = createPeerMesh({
      myUserId: 7,
      channel,
      iceServers: [],
      createPeerConnection: () => {
        const pc = createFakePc();
        if (first) {
          first = false;
          pc.createOffer = async () => {
            throw new Error("offer 실패");
          };
        }
        pcs.push(pc);
        return pc as unknown as RTCPeerConnection;
      },
    });
    mesh.start();
    mesh.subscribeRemoteStreams((userId, stream) => received.push([userId, stream]));

    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8), member(9)] });

    await vi.waitFor(() => {
      expect(received).toContainEqual([8, null]);
    });
    await vi.waitFor(() => {
      expect(channel.publishedSignals.map((s) => s.toUserId)).toEqual([9]);
    });
  });

  it("잘못된 SDP payload는 무시한다 — ANSWER를 발행하지 않는다", async () => {
    const { channel, pcs } = setup();

    channel.emitServerMessage({ type: "SIGNAL", fromUserId: 8, kind: "OFFER", payload: "junk" });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(channel.publishedSignals).toEqual([]);
    expect(pcs).toHaveLength(0);
  });

  it("원격 서술 적용이 실패하면 그 상대만 아바타로 내린다 — 조용한 미표시 방지", async () => {
    const { channel, pcs, mesh } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    const received: [number, MediaStream | null][] = [];
    mesh.subscribeRemoteStreams((userId, stream) => received.push([userId, stream]));
    pcs[0]!.pc.setRemoteDescription = async () => {
      throw new Error("bad sdp");
    };

    channel.emitServerMessage({
      type: "SIGNAL",
      fromUserId: 8,
      kind: "ANSWER",
      payload: { type: "answer", sdp: "broken" },
    });

    await vi.waitFor(() => {
      expect(received).toEqual([[8, null]]);
    });
  });

  it("iceConnectionState failed면 restartIce를 부르고, 다시 failed면 스트림 null을 통지한다", async () => {
    const { channel, pcs, mesh } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8)] });
    await vi.waitFor(() => expect(pcs).toHaveLength(1));
    const received: [number, MediaStream | null][] = [];
    mesh.subscribeRemoteStreams((userId, stream) => received.push([userId, stream]));

    pcs[0]?.pc.fireIceState("failed");
    expect(pcs[0]?.pc.restartIce).toHaveBeenCalledTimes(1);
    expect(received).toEqual([]);

    pcs[0]?.pc.fireIceState("failed");
    expect(received).toEqual([[8, null]]);
  });

  it("close()는 모든 PC를 닫고 채널 구독을 해지한다", async () => {
    const { channel, pcs, mesh } = setup();
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(8), member(9)] });
    await vi.waitFor(() => expect(pcs).toHaveLength(2));

    mesh.close();

    expect(pcs.every((entry) => entry.pc.closed)).toBe(true);
    channel.emitServerMessage({ type: "SNAPSHOT", members: [member(7), member(10)] });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(pcs).toHaveLength(2);
  });

  it("모르는 userId의 ANSWER·CANDIDATE는 무시한다", async () => {
    const { channel, pcs } = setup();

    channel.emitServerMessage({
      type: "SIGNAL",
      fromUserId: 99,
      kind: "ANSWER",
      payload: { type: "answer", sdp: "x" },
    });
    channel.emitServerMessage({
      type: "SIGNAL",
      fromUserId: 99,
      kind: "CANDIDATE",
      payload: { candidate: "c" },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(pcs).toHaveLength(0);
    expect(channel.publishedSignals).toEqual([]);
  });
});
