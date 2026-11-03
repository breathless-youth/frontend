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

/** 상태 변화를 보낼 수 있는 가짜 AudioContext */
function fakeContext() {
  const gains: { gain: { value: number }; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const sources: ReturnType<typeof fakeNode>[] = [];
  const analysers: (ReturnType<typeof fakeNode> & { fftSize: number })[] = [];
  const ctx = Object.assign(new EventTarget(), {
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
    /** OS가 컨텍스트를 멈추거나 되살린 것처럼 상태를 바꾸고 알린다. */
    fire(state: string) {
      ctx.state = state;
      ctx.dispatchEvent(new Event("statechange"));
    },
  });
  return { ctx: ctx as unknown as AudioContext, raw: ctx, gains, sources, analysers };
}

/**
 * 재생 상태를 가진 가짜 audio 요소
 *
 * rejectNext를 켜 두면 다음 재생을 자동재생 정책처럼 거부하고 멈춘 채로 남는다.
 */
function fakeMedia({ rejectNext = false }: { rejectNext?: boolean } = {}) {
  const element = {
    muted: false,
    srcObject: null as unknown,
    paused: true,
    rejectNext,
    play: vi.fn(async () => {
      if (element.rejectNext) {
        element.rejectNext = false;
        throw new DOMException("x", "NotAllowedError");
      }
      element.paused = false;
    }),
    pause: vi.fn(() => {
      element.paused = true;
    }),
  };
  return element;
}

type FakeMedia = ReturnType<typeof fakeMedia>;

function player({
  assistRejects = false,
  keepAliveRejects = false,
}: { assistRejects?: boolean; keepAliveRejects?: boolean } = {}) {
  const { ctx, raw, gains, sources, analysers } = fakeContext();
  const assists: FakeMedia[] = [];
  const keepAlive = fakeMedia({ rejectNext: keepAliveRejects });
  const instance = createRemoteAudioPlayer({
    audioContextFactory: () => ctx,
    createAssistElement: () => {
      const element = fakeMedia({ rejectNext: assistRejects });
      assists.push(element);
      return element as unknown as HTMLAudioElement;
    },
    keepAliveFactory: () => keepAlive as unknown as HTMLAudioElement,
  });
  return { instance, gains, sources, analysers, assists, keepAlive, ctx: raw };
}

/** 거부된 재생 약속이 끝나도록 한 바퀴 흘려보낸다. */
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

  it("붙이면 보조 요소를 음소거로 재생한다", () => {
    const { instance, assists } = player();
    instance.attach(2, track());
    instance.attach(3, track());
    expect(assists.every((element) => element.muted)).toBe(true);
    expect(assists.every((element) => vi.mocked(element.play).mock.calls.length === 1)).toBe(true);
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
    const { instance, ctx } = player();
    instance.attach(2, track());
    instance.setLocalMeter(track());
    instance.close();
    expect(ctx.close).toHaveBeenCalledOnce();
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

describe("멈춘 재생 되살리기", () => {
  it("부르지 않았는데 컨텍스트가 멈추면 들을 상대가 있는 동안 다시 깨운다", () => {
    const { instance, ctx } = player();
    instance.attach(2, track());

    ctx.fire("interrupted");

    expect(ctx.resume).toHaveBeenCalledOnce();
  });

  it("들을 상대가 없거나 컨텍스트가 돌고 있으면 깨우지 않는다", () => {
    const { instance, ctx } = player();
    instance.attach(2, track());
    ctx.fire("running");
    instance.detach(2);
    ctx.fire("interrupted");

    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it("재생을 거부당한 보조 요소는 resume에서 다시 건다", async () => {
    const { instance, assists } = player({ assistRejects: true });
    instance.attach(2, track());
    await settle();
    expect(assists[0]?.paused).toBe(true);
    expect(instance.needsResume()).toBe(true);

    await instance.resume();

    expect(assists[0]?.play).toHaveBeenCalledTimes(2);
    expect(assists[0]?.paused).toBe(false);
  });

  it("거부당한 keep-alive는 resume에서 다시 건다", async () => {
    const { instance, keepAlive } = player({ keepAliveRejects: true });
    instance.attach(2, track());
    instance.setMicOnUsers(new Set([2]));
    await settle();
    expect(keepAlive.paused).toBe(true);

    await instance.resume();

    expect(keepAlive.play).toHaveBeenCalledTimes(2);
    expect(keepAlive.paused).toBe(false);
  });

  it("시스템이 멈춘 keep-alive는 요소의 멈춤 상태를 보고 resume에서 다시 건다", async () => {
    const { instance, keepAlive } = player();
    instance.attach(2, track());
    instance.setMicOnUsers(new Set([2]));
    expect(keepAlive.play).toHaveBeenCalledOnce();

    keepAlive.paused = true;
    await instance.resume();

    expect(keepAlive.play).toHaveBeenCalledTimes(2);
  });

  it("다시 걸어야 할 재생이 있는지 알린다", async () => {
    const { instance, ctx, assists, keepAlive } = player();
    expect(instance.needsResume()).toBe(true);

    await instance.resume();
    expect(instance.needsResume()).toBe(false);

    instance.attach(2, track());
    instance.setMicOnUsers(new Set([2]));
    expect(instance.needsResume()).toBe(false);

    assists[0]!.paused = true;
    expect(instance.needsResume()).toBe(true);
    await instance.resume();
    expect(instance.needsResume()).toBe(false);

    keepAlive.paused = true;
    expect(instance.needsResume()).toBe(true);
    await instance.resume();
    expect(instance.needsResume()).toBe(false);

    ctx.state = "suspended";
    expect(instance.needsResume()).toBe(true);
  });

  it("컨텍스트를 만들 수 없는 브라우저는 한 번 깨워 본 뒤로는 다시 걸 것이 없다", async () => {
    const instance = createRemoteAudioPlayer({
      audioContextFactory: () => null,
      keepAliveFactory: () => null,
    });
    expect(instance.needsResume()).toBe(true);

    await instance.resume();

    expect(instance.needsResume()).toBe(false);
  });
});

describe("마이크를 켠 멤버가 있을 때만 keep-alive", () => {
  it("모두 마이크를 끈 동안에는 소리를 붙여도 keep-alive를 멈춰 둔다", () => {
    const { instance, keepAlive } = player();
    instance.attach(2, track());
    instance.attach(3, track());
    instance.setMicOnUsers(new Set());

    expect(keepAlive.play).not.toHaveBeenCalled();
    expect(keepAlive.paused).toBe(true);
  });

  it("붙은 멤버 한 명이 마이크를 켜면 재생하고 모두 끄면 다시 멈춘다", () => {
    const { instance, keepAlive } = player();
    instance.attach(2, track());
    instance.attach(3, track());

    instance.setMicOnUsers(new Set([2]));
    expect(keepAlive.play).toHaveBeenCalledOnce();
    instance.setMicOnUsers(new Set([2, 3]));
    expect(keepAlive.play).toHaveBeenCalledOnce();

    instance.setMicOnUsers(new Set());
    expect(keepAlive.pause).toHaveBeenCalledOnce();
    expect(keepAlive.paused).toBe(true);
  });

  it("마이크를 켠 멤버라도 소리가 붙어야 재생한다", () => {
    const { instance, keepAlive } = player();
    instance.attach(2, track());
    instance.setMicOnUsers(new Set([9]));
    expect(keepAlive.play).not.toHaveBeenCalled();

    instance.attach(9, track());

    expect(keepAlive.play).toHaveBeenCalledOnce();
  });

  it("마이크를 켠 멤버의 소리가 떨어지면 멈춘다", () => {
    const { instance, keepAlive } = player();
    instance.attach(2, track());
    instance.attach(3, track());
    instance.setMicOnUsers(new Set([2]));

    instance.detach(2);

    expect(keepAlive.pause).toHaveBeenCalledOnce();
    expect(keepAlive.paused).toBe(true);
  });

  it("공부방을 나가면 멈춘다", () => {
    const { instance, keepAlive } = player();
    instance.attach(2, track());
    instance.setMicOnUsers(new Set([2]));

    instance.close();

    expect(keepAlive.pause).toHaveBeenCalledOnce();
    expect(keepAlive.paused).toBe(true);
  });
});
