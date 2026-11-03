import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRemoteAudioPlayer } from "../remoteAudio";

// jsdom에는 MediaStream이 없어서 트랙을 담기만 하는 가짜를 둔다.
class FakeMediaStream {
  readonly tracks: unknown[];
  constructor(tracks: unknown[]) {
    this.tracks = tracks;
  }
}

beforeEach(() => {
  vi.stubGlobal("MediaStream", FakeMediaStream);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeNode() {
  return { connect: vi.fn(), disconnect: vi.fn() };
}

function fakeContext() {
  const gains: { gain: { value: number }; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const sources: ReturnType<typeof fakeNode>[] = [];
  const analysers: (ReturnType<typeof fakeNode> & { fftSize: number })[] = [];
  const ctx = {
    state: "suspended",
    resume: vi.fn(async () => {
      ctx.state = "running";
    }),
    close: vi.fn(async () => undefined),
    destination: {},
    createMediaStreamSource: vi.fn(() => {
      const node = fakeNode();
      sources.push(node);
      return node;
    }),
    createAnalyser: vi.fn(() => {
      const node = {
        ...fakeNode(),
        fftSize: 0,
        getFloatTimeDomainData: (data: Float32Array) => data.fill(0.1),
      };
      analysers.push(node);
      return node;
    }),
    createGain: vi.fn(() => {
      const node = { gain: { value: 1 }, ...fakeNode() };
      gains.push(node);
      return node;
    }),
  };
  return { ctx: ctx as unknown as AudioContext, raw: ctx, gains, sources, analysers };
}

function player() {
  const { ctx, raw, gains, sources, analysers } = fakeContext();
  const assists: HTMLAudioElement[] = [];
  const keepAlive = {
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
  } as unknown as HTMLAudioElement;
  const instance = createRemoteAudioPlayer({
    audioContextFactory: () => ctx,
    createAssistElement: () => {
      const element = {
        muted: false,
        srcObject: null,
        play: vi.fn(async () => undefined),
        pause: vi.fn(),
      } as unknown as HTMLAudioElement;
      assists.push(element);
      return element;
    },
    keepAliveFactory: () => keepAlive,
  });
  return { instance, gains, sources, analysers, assists, keepAlive, ctx: raw };
}

const track = () => ({ kind: "audio" }) as unknown as MediaStreamTrack;

describe("createRemoteAudioPlayer", () => {
  it("사람별 음량은 그 사람의 출력만 바꾼다", () => {
    const { instance, gains } = player();
    instance.attach(2, track());
    instance.attach(3, track());
    instance.setVolume(2, 0.4);
    expect(gains.map((g) => g.gain.value)).toEqual([0.4, 1]);
  });

  it("다른 사람 소리 끄기는 모두를 0으로 하고 풀면 각자 음량으로 돌아간다", () => {
    const { instance, gains } = player();
    instance.attach(2, track());
    instance.attach(3, track());
    instance.setVolume(2, 0.4);
    instance.setMuted(3, true);
    instance.setAllMuted(true);
    expect(gains.map((g) => g.gain.value)).toEqual([0, 0]);
    instance.setAllMuted(false);
    expect(gains.map((g) => g.gain.value)).toEqual([0.4, 0]);
  });

  it("음량은 0과 1 사이로 자른다", () => {
    const { instance, gains } = player();
    instance.attach(2, track());
    instance.setVolume(2, 1.5);
    expect(gains[0]?.gain.value).toBe(1);
    instance.setVolume(2, -0.2);
    expect(gains[0]?.gain.value).toBe(0);
  });

  it("붙이면 보조 요소를 음소거로 재생하고 처음 한 번 keep-alive를 켠다", () => {
    const { instance, assists, keepAlive } = player();
    instance.attach(2, track());
    instance.attach(3, track());
    expect(assists.every((element) => element.muted)).toBe(true);
    expect(assists.every((element) => vi.mocked(element.play).mock.calls.length === 1)).toBe(true);
    expect(keepAlive.play).toHaveBeenCalledOnce();
    instance.detach(2);
    instance.detach(3);
    expect(keepAlive.pause).toHaveBeenCalledOnce();
  });

  it("떼면 그 사람의 노드를 끊고 보조 요소를 멈춘다", () => {
    const { instance, gains, assists } = player();
    instance.attach(2, track());
    instance.detach(2);
    expect(gains[0]?.disconnect).toHaveBeenCalled();
    expect(assists[0]?.pause).toHaveBeenCalled();
    expect(assists[0]?.srcObject).toBeNull();
    expect(instance.level(2)).toBe(0);
  });

  it("같은 사람을 다시 붙여도 그 사람 음량과 소리 끄기는 남는다", () => {
    const { instance, gains } = player();
    instance.attach(2, track());
    instance.setVolume(2, 0.3);
    instance.detach(2);
    instance.attach(2, track());
    expect(gains.at(-1)?.gain.value).toBe(0.3);
    instance.setMuted(2, true);
    instance.attach(2, track());
    expect(gains.at(-1)?.gain.value).toBe(0);
  });

  it("소리 크기는 이득 앞에서 읽는다", () => {
    const { instance } = player();
    instance.attach(2, track());
    instance.setMuted(2, true);
    expect(instance.level(2)).toBeCloseTo(0.1);
  });

  it("내 마이크 소리 크기는 스피커로 내보내지 않고 읽는다", () => {
    const { instance, gains, sources, analysers } = player();
    instance.setLocalMeter(track());
    expect(instance.localLevel()).toBeCloseTo(0.1);
    expect(gains).toHaveLength(0);
    expect(sources[0]?.connect).toHaveBeenCalledWith(analysers[0]);
    expect(analysers[0]?.connect).not.toHaveBeenCalled();
    instance.setLocalMeter(null);
    expect(instance.localLevel()).toBe(0);
    expect(sources[0]?.disconnect).toHaveBeenCalled();
  });

  it("resume은 아직 없는 컨텍스트도 만들어 깨운다", async () => {
    const { instance, ctx } = player();
    await instance.resume();
    expect(ctx.resume).toHaveBeenCalledOnce();
    expect(ctx.state).toBe("running");
  });

  it("닫으면 모두 떼고 컨텍스트를 닫는다", () => {
    const { instance, ctx, keepAlive } = player();
    instance.attach(2, track());
    instance.setLocalMeter(track());
    instance.close();
    expect(ctx.close).toHaveBeenCalledOnce();
    expect(keepAlive.pause).toHaveBeenCalledOnce();
    expect(instance.level(2)).toBe(0);
    expect(instance.localLevel()).toBe(0);
  });

  it("AudioContext를 만들 수 없으면 아무 일도 하지 않는다", () => {
    const instance = createRemoteAudioPlayer({
      audioContextFactory: () => null,
      keepAliveFactory: () => null,
    });
    expect(() => instance.attach(2, track())).not.toThrow();
    expect(instance.level(2)).toBe(0);
  });
});
