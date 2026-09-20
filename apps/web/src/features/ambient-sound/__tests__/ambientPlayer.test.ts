import { afterEach, describe, expect, it, vi } from "vitest";

import type { AmbientSound } from "../catalog";
import { createMemoryPlayer, createWebAudioPlayer } from "../ambientPlayer";

const catalog: AmbientSound[] = [
  { id: "white", kind: "synth", label: "백색소음" },
  { id: "pink", kind: "synth", label: "핑크노이즈" },
  { id: "brown", kind: "synth", label: "브라운노이즈" },
  { id: "rain", kind: "file", label: "빗소리", file: "rain.mp3" },
  { id: "cafe", kind: "file", label: "카페", file: "cafe.mp3" },
];

type Listener = () => void;

type FakeParam = {
  value: number;
  setValueAtTime(value: number, at: number): void;
  linearRampToValueAtTime(value: number, at: number): void;
  cancelScheduledValues(at: number): void;
  cancelAndHoldAtTime?(at: number): void;
};

/**
 * 명령을 문자열 로그로 남기는 최소 가짜 AudioContext. `hold` 가 false 면 Firefox 처럼
 * `cancelAndHoldAtTime` 이 없는 AudioParam 을 만든다.
 */
function createFakeContext(initialState: AudioContextState = "running", hold = true) {
  const log: string[] = [];
  const listeners = new Set<Listener>();
  let nextId = 0;

  const fakeParam = (name: string) => {
    const param: FakeParam = {
      value: 1,
      setValueAtTime(value: number, at: number) {
        param.value = value;
        log.push(`${name}.set(${value},${at})`);
      },
      linearRampToValueAtTime(value: number, at: number) {
        param.value = value;
        log.push(`${name}.ramp(${value},${at})`);
      },
      cancelScheduledValues(at: number) {
        log.push(`${name}.cancel(${at})`);
      },
    };
    if (hold) {
      param.cancelAndHoldAtTime = (at: number) => {
        log.push(`${name}.hold(${at})`);
      };
    }
    return param;
  };

  // 만든 순서대로. 첫 번째가 마스터, 나머지는 소리별 게인이다.
  const gains: { name: string; gain: FakeParam }[] = [];
  const limiters: { name: string; threshold: { value: number }; ratio: { value: number } }[] = [];
  const sources: { name: string; onended: null | (() => void) }[] = [];

  const ctx = {
    state: initialState,
    currentTime: 0,
    sampleRate: 1000,
    destination: { name: "destination" },
    gains,
    limiters,
    sources,
    /** 페이드아웃이 끝난 것으로 친다. */
    endSource(name: string) {
      sources.find((s) => s.name === name)?.onended?.();
    },
    createGain() {
      const name = `gain${nextId++}`;
      log.push(`createGain:${name}`);
      const node = {
        name,
        gain: fakeParam(name),
        connect(target: { name: string }) {
          log.push(`${name}->${target.name}`);
        },
      };
      gains.push(node);
      return node;
    },
    createDynamicsCompressor() {
      const name = `limiter${nextId++}`;
      log.push(`createDynamicsCompressor:${name}`);
      const node = {
        name,
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 0 },
        attack: { value: 0 },
        release: { value: 0 },
        connect(target: { name: string }) {
          log.push(`${name}->${target.name}`);
        },
      };
      limiters.push(node);
      return node;
    },
    createBufferSource() {
      const name = `src${nextId++}`;
      log.push(`createBufferSource:${name}`);
      const node = {
        name,
        buffer: null as unknown,
        loop: false,
        onended: null as null | (() => void),
        connect(target: { name: string }) {
          log.push(`${name}->${target.name}`);
        },
        start(at = 0) {
          log.push(`${name}.start(${at})`);
        },
        // 실제 노드는 예약한 시각이 와야 onended 를 부른다. 테스트가 그 시점을 직접 고르도록
        // 자동으로 부르지 않고 `ctx.endSource(name)` 으로 흉내 낸다.
        stop(at = 0) {
          log.push(`${name}.stop(${at})`);
        },
      };
      sources.push(node);
      return node;
    },
    createBuffer(channels: number, length: number, sampleRate: number) {
      log.push(`createBuffer(${channels},${length},${sampleRate})`);
      return {
        getChannelData(channel: number) {
          log.push(`getChannelData(${channel})`);
          return {
            set(samples: ArrayLike<number>) {
              log.push(`set(${samples.length})`);
            },
          };
        },
      };
    },
    decodeAudioData: vi.fn((data: ArrayBuffer) => {
      log.push(`decode(${data.byteLength})`);
      return Promise.resolve({ decoded: data.byteLength });
    }),
    // 실제 컨텍스트처럼 state 는 호출 즉시가 아니라 promise 가 settle 된 뒤에 바뀐다.
    resume: vi.fn(() => {
      log.push("resume");
      return Promise.resolve().then(() => {
        ctx.state = "running";
        ctx.emit();
      });
    }),
    suspend: vi.fn(() => {
      log.push("suspend");
      return Promise.resolve().then(() => {
        ctx.state = "suspended";
        ctx.emit();
      });
    }),
    close: vi.fn(() => {
      log.push("close");
      ctx.state = "closed";
      return Promise.resolve();
    }),
    addEventListener(type: string, fn: Listener) {
      log.push(`on:${type}`);
      listeners.add(fn);
    },
    removeEventListener(type: string, fn: Listener) {
      log.push(`off:${type}`);
      listeners.delete(fn);
    },
    emit() {
      for (const fn of listeners) fn();
    },
    log,
    listenerCount: () => listeners.size,
  };
  return ctx;
}

function okResponse(bytes: number) {
  return { ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(bytes)) } as Response;
}

function setup(initialState: AudioContextState = "running", hold = true) {
  const ctx = createFakeContext(initialState, hold);
  const factory = vi.fn(() => ctx as unknown as AudioContext);
  const fetchImpl = vi.fn((input: string | URL | Request) =>
    Promise.resolve(String(input).endsWith("cafe.mp3") ? okResponse(8) : okResponse(4)),
  ) as unknown as typeof fetch;
  const player = createWebAudioPlayer({ catalog, audioContextFactory: factory, fetchImpl });
  return { ctx, factory, fetchImpl: fetchImpl as unknown as ReturnType<typeof vi.fn>, player };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createWebAudioPlayer", () => {
  it("AudioContext 가 없으면 조용히 no-op 이고 idle 이다", async () => {
    const player = createWebAudioPlayer({ catalog, audioContextFactory: () => null });
    await expect(player.applyMix({ white: 50 })).resolves.toEqual({ failed: [] });
    player.setDucked(true);
    player.suspend();
    player.resume();
    player.dispose();
    expect(player.getState()).toBe("idle");
  });

  it("컨텍스트 생성이 throw 해도 예외를 내지 않는다", async () => {
    const player = createWebAudioPlayer({
      catalog,
      audioContextFactory: () => {
        throw new Error("no audio");
      },
    });
    await expect(player.applyMix({ white: 50 })).resolves.toEqual({ failed: [] });
    expect(player.getState()).toBe("idle");
  });

  it("기본 팩토리는 globalThis.AudioContext 를 쓴다", async () => {
    const ctx = createFakeContext();
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function () {
        return ctx;
      }),
    );
    const player = createWebAudioPlayer({ catalog });
    await player.applyMix({ white: 50 });
    expect(player.getState()).toBe("playing");
  });

  /**
   * iOS 사파리는 사용자 조작의 호출 스택 안에서 부른 resume 만 받아들인다. 버퍼를 받고
   * 디코딩한 뒤에 부르면 그때는 조작이 끝나 있어 무시되고, 컨텍스트가 suspended 로 남아
   * 소리가 나지 않는다. 그래서 깨우기가 반드시 버퍼 작업보다 앞서야 한다.
   */
  it("버퍼를 만들기 전에 컨텍스트를 깨운다", async () => {
    const { ctx, player } = setup("suspended");

    await player.applyMix({ white: 50 });

    const resumeAt = ctx.log.indexOf("resume");
    const sourceAt = ctx.log.findIndex((line) => line.startsWith("createBufferSource"));
    expect(resumeAt).toBeGreaterThanOrEqual(0);
    expect(sourceAt).toBeGreaterThanOrEqual(0);
    expect(resumeAt).toBeLessThan(sourceAt);
  });

  it("파일을 기다리는 동안에도 깨우기가 먼저 나간다", async () => {
    const ctx = createFakeContext("suspended", true);
    let releaseSlow: (() => void) | undefined;
    const slow = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    const player = createWebAudioPlayer({
      catalog,
      audioContextFactory: () => ctx as unknown as AudioContext,
      fetchImpl: vi.fn(() => slow.then(() => okResponse(4))) as unknown as typeof fetch,
    });

    const pending = player.applyMix({ rain: 50 });
    for (let i = 0; i < 10; i += 1) await Promise.resolve();

    // 파일이 아직 오지 않았는데도 깨우기는 이미 나가 있어야 한다.
    expect(ctx.log).toContain("resume");
    expect(ctx.log.some((line) => line.startsWith("createBufferSource"))).toBe(false);

    releaseSlow?.();
    await pending;
  });

  it("빈 믹스로는 컨텍스트를 만들지 않는다", async () => {
    const { factory, player } = setup();
    await expect(player.applyMix({})).resolves.toEqual({ failed: [] });
    expect(factory).not.toHaveBeenCalled();
    expect(player.getState()).toBe("idle");
  });

  it("첫 비어있지 않은 applyMix 에 그래프를 만들고 150ms 페이드 인으로 시작한다", async () => {
    const { ctx, factory, player } = setup();
    await player.applyMix({ white: 50 });

    expect(factory).toHaveBeenCalledTimes(1);
    // 레벨 50 → 게인 0.25 (제곱 매핑)
    expect(ctx.log).toEqual([
      "createGain:gain0",
      "createGain:gain1",
      "createDynamicsCompressor:limiter2",
      "gain0->gain1",
      "gain1->limiter2",
      "limiter2->destination",
      "gain0.set(0.5,0)",
      "gain1.set(1,0)",
      "on:statechange",
      "createBuffer(1,4000,1000)",
      "getChannelData(0)",
      "set(4000)",
      "createBufferSource:src3",
      "createGain:gain4",
      "src3->gain4",
      "gain4->gain0",
      "gain4.set(0,0)",
      "gain4.ramp(0.25,0.15)",
      "src3.start(0)",
    ]);
    expect(player.getState()).toBe("playing");
  });

  it("레벨을 게인으로 바꿀 때 제곱을 쓴다", async () => {
    const { ctx, player } = setup();
    await player.applyMix({ white: 100, pink: 10 });
    expect(ctx.log).toContain("gain4.ramp(1,0.15)");
    expect(ctx.log).toContain("gain6.ramp(0.010000000000000002,0.15)");
  });

  /**
   * 겹쳐 켜는 개수에 상한이 없으므로 마스터가 고정값이면 넷째부터 출력단에서 깨진다.
   * 노이즈끼리는 상관이 없어 합의 실효값이 전력 합으로 자라니, 그 합을 1 아래로 묶는 것이
   * 마스터의 일이다. 게인 식을 바꾸면 여기서 먼저 깨진다.
   */
  it.each([
    ["셋", { white: 100, pink: 100, rain: 100 }],
    ["넷", { white: 100, pink: 100, brown: 100, rain: 100 }],
    ["다섯", { white: 100, pink: 100, brown: 100, rain: 100, cafe: 100 }],
  ])("%s을 최대 레벨로 켜도 합산 게인(전력 합)이 1 을 넘지 않는다", async (_, mix) => {
    const { ctx, player } = setup();
    await player.applyMix(mix);

    const [headroom, , ...voices] = ctx.gains;
    expect(voices).toHaveLength(Object.keys(mix).length);
    const power = voices.reduce(
      (sum, v) => sum + (v.gain.value * (headroom?.gain.value ?? 1)) ** 2,
      0,
    );
    expect(power).toBeLessThanOrEqual(1);
    expect(headroom?.gain.value).toBeLessThan(1);
  });

  /** 셋까지는 예전 고정 헤드룸과 같아야 한다 — 기존 사용자의 음량이 조용히 바뀌면 안 된다. */
  it("소리가 셋 이하면 헤드룸이 0.5 그대로다", async () => {
    const { ctx, player } = setup();
    await player.applyMix({ white: 100, pink: 100, rain: 100 });
    expect(ctx.gains[0]?.gain.value).toBe(0.5);
  });

  /**
   * 헤드룸은 실제로 나는 소리만 세야 한다. 못 받은 파일까지 세면 나지도 않는 소리 때문에
   * 나머지가 조용해진다.
   */
  it("불러오지 못한 소리는 헤드룸을 낮추지 않는다", async () => {
    const ctx = createFakeContext("running", true);
    const player = createWebAudioPlayer({
      catalog,
      audioContextFactory: () => ctx as unknown as AudioContext,
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch,
    });
    const { failed } = await player.applyMix({
      white: 100,
      pink: 100,
      brown: 100,
      rain: 100,
      cafe: 100,
    });

    expect(failed.sort()).toEqual(["cafe", "rain"]);
    expect(ctx.gains[0]?.gain.value).toBe(0.5);
  });

  /**
   * 제곱합 예산은 실효값 근사라 순간 피크가 같은 방향으로 겹치는 경우까지 막지 못한다.
   * 출력 직전에 리미터가 한 단 있어야 클리핑이 실제로 보장된다.
   */
  it("덕킹 게인과 출력 사이에 리미터가 들어가고 설정값이 고정된다", async () => {
    const { ctx, player } = setup();
    await player.applyMix({ white: 50 });

    // 값이 느슨해지면 리미터가 있으나 마나가 된다. threshold 가 0 에 가까워지거나 attack 이
    // 길어지면 첫 피크를 놓치므로 다섯 값을 그대로 잠근다.
    expect(ctx.limiters[0]).toMatchObject({
      threshold: { value: -2 },
      knee: { value: 0 },
      ratio: { value: 20 },
      attack: { value: 0.003 },
      release: { value: 0.25 },
    });
    expect(ctx.log).toContain("gain0->gain1");
    expect(ctx.log).toContain("gain1->limiter2");
    expect(ctx.log).toContain("limiter2->destination");
  });

  /**
   * 세션이 멈춰 있는 동안 처음 소리를 켜는 경로. 컨텍스트가 없을 때의 suspend 는 플래그만
   * 세우는데, 새로 태어나는 컨텍스트는 running 이라 여기서 다시 멈추지 않으면 소리가 난다.
   */
  it("컨텍스트가 없을 때 멈춰 두면 나중에 만들어지는 컨텍스트도 멈춘 채로 시작한다", async () => {
    const { ctx, player } = setup();

    await player.suspend();
    await player.applyMix({ white: 50 });
    await Promise.resolve();

    expect(ctx.suspend).toHaveBeenCalled();
    expect(ctx.resume).not.toHaveBeenCalled();
    expect(player.getState()).toBe("suspended");
  });

  /**
   * 파일 하나가 늦게 도착해도 먼저 시작한 소리들은 이미 나고 있다. 마스터를 마지막에 한 번만
   * 맞추면 그 사이가 통째로 클리핑 구간이 된다.
   */
  it("느린 소리를 기다리는 동안에도 먼저 시작한 소리에 맞춰 마스터가 내려간다", async () => {
    const ctx = createFakeContext("running", true);
    let releaseSlow: (() => void) | undefined;
    const slow = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    const player = createWebAudioPlayer({
      catalog,
      audioContextFactory: () => ctx as unknown as AudioContext,
      fetchImpl: vi.fn((input: string | URL | Request) =>
        String(input).endsWith("cafe.mp3")
          ? slow.then(() => okResponse(8))
          : Promise.resolve(okResponse(4)),
      ) as unknown as typeof fetch,
    });

    const pending = player.applyMix({
      white: 100,
      pink: 100,
      brown: 100,
      rain: 100,
      cafe: 100,
    });
    // cafe 를 뺀 넷이 시작될 때까지 마이크로태스크를 흘린다.
    for (let i = 0; i < 20; i += 1) await Promise.resolve();

    expect(ctx.gains[0]?.gain.value).toBeLessThan(0.5);

    releaseSlow?.();
    await pending;
  });

  /**
   * 재생 시간 계측이 `applyMix` 의 resolve 를 기다리면, 파일 하나가 10초 늦게 올 때 그 10초
   * 동안 실제로 나고 있던 합성음이 통째로 빠진다. 보이스가 시작하는 순간에 알려 줘야 한다.
   */
  it("들리는 상태가 바뀔 때마다 applyMix 가 끝나기 전에 알려 준다", async () => {
    const ctx = createFakeContext("running", true);
    let releaseSlow: (() => void) | undefined;
    const slow = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    const onPlaybackChanged = vi.fn();
    const player = createWebAudioPlayer({
      catalog,
      audioContextFactory: () => ctx as unknown as AudioContext,
      fetchImpl: vi.fn((input: string | URL | Request) =>
        String(input).endsWith("cafe.mp3")
          ? slow.then(() => okResponse(8))
          : Promise.resolve(okResponse(4)),
      ) as unknown as typeof fetch,
      onPlaybackChanged,
    });

    const pending = player.applyMix({ white: 50, cafe: 50 });
    for (let i = 0; i < 20; i += 1) await Promise.resolve();

    // 느린 파일을 기다리는 동안에도 이미 나고 있다고 알려야 그 시간이 계측에 들어간다.
    expect(onPlaybackChanged).toHaveBeenCalledTimes(1);
    expect(player.getState()).toBe("playing");

    releaseSlow?.();
    await pending;
    // 둘째 보이스가 늘어도 재생은 재생이라 다시 알리지 않는다.
    expect(onPlaybackChanged).toHaveBeenCalledTimes(1);

    await player.applyMix({});
    expect(player.getState()).toBe("playing");
    ctx.endSource("src3");
    ctx.endSource("src5");

    expect(player.getState()).toBe("idle");
    expect(onPlaybackChanged).toHaveBeenCalledTimes(2);
  });

  it("차이만 반영한다: 남은 소리는 램프, 빠진 소리는 페이드 아웃 뒤 stop, 같은 레벨은 명령 없음", async () => {
    const { ctx, player } = setup();
    await player.applyMix({ white: 50, pink: 50 });
    ctx.log.length = 0;
    ctx.currentTime = 10;

    await player.applyMix({ white: 80, rain: 20 });

    expect(ctx.log).toEqual([
      // pink 제거: 현재 값을 붙든 채 0 으로 150ms 램프 뒤 정지
      "gain6.hold(10)",
      "gain6.ramp(0,10.15)",
      "src5.stop(10.15)",
      // white 레벨 변경: 0.25 → 0.64
      "gain4.hold(10)",
      "gain4.ramp(0.6400000000000001,10.15)",
      // rain 추가
      "decode(4)",
      "createBufferSource:src7",
      "createGain:gain8",
      "src7->gain8",
      "gain8->gain0",
      "gain8.set(0,10)",
      "gain8.ramp(0.04000000000000001,10.15)",
      "src7.start(10)",
    ]);

    ctx.log.length = 0;
    await player.applyMix({ white: 80, rain: 20 });
    expect(ctx.log).toEqual([]);
  });

  /**
   * 끄는 순간이 아니라 페이드가 끝나야 idle 이다. 그 전에 끊으면 끄고 켤 때마다 재생 시간이
   * 150ms 씩 빠진다.
   */
  it("페이드아웃이 끝나야 idle 이 되고 컨텍스트는 유지된다", async () => {
    const { ctx, player } = setup();
    await player.applyMix({ white: 50 });
    await player.applyMix({});

    expect(player.getState()).toBe("playing");

    ctx.endSource("src3");

    expect(player.getState()).toBe("idle");
    expect(ctx.close).not.toHaveBeenCalled();
  });

  it("페이드아웃이 끝나는 순간에도 알려 준다", async () => {
    const ctx = createFakeContext("running", true);
    const onPlaybackChanged = vi.fn();
    const player = createWebAudioPlayer({
      catalog,
      audioContextFactory: () => ctx as unknown as AudioContext,
      onPlaybackChanged,
    });
    await player.applyMix({ white: 50 });
    await player.applyMix({});
    onPlaybackChanged.mockClear();

    ctx.endSource("src3");

    expect(onPlaybackChanged).toHaveBeenCalledTimes(1);
    expect(player.getState()).toBe("idle");
  });

  /**
   * 전화·알람으로 컨텍스트가 멈추면 훅이 재생 시간을 끊어야 한다. 알리지 않고 되살리기만
   * 시도하면, 복구가 막힌 동안 통화 시간이 통째로 배경음 사용 시간에 더해진다.
   */
  it("우리가 부르지 않은 멈춤과 복구 실패를 모두 알려 준다", async () => {
    const ctx = createFakeContext("running", true);
    const onPlaybackChanged = vi.fn();
    const player = createWebAudioPlayer({
      catalog,
      audioContextFactory: () => ctx as unknown as AudioContext,
      onPlaybackChanged,
    });
    await player.applyMix({ white: 50 });
    onPlaybackChanged.mockClear();
    // 복구가 계속 막히는 상황 — iOS 통화 중에 실제로 이렇게 된다.
    ctx.resume = vi.fn(() => Promise.resolve());

    const seen: string[] = [];
    onPlaybackChanged.mockImplementation(() => seen.push(player.getState()));

    ctx.state = "interrupted" as AudioContextState;
    ctx.emit();
    await Promise.resolve();
    await Promise.resolve();

    // 멈춘 사실과 복구가 막힌 사실을 각각 한 번씩 알려야 한다. 앞의 것이 빠지면 통화가
    // 끝날 때까지 계측이 돌고, 뒤의 것이 빠지면 막힌 상태를 화면이 모른다.
    expect(seen).toEqual(["suspended", "blocked"]);
    expect(player.getState()).toBe("blocked");
  });

  /** dispose 뒤에 늦게 오는 onended 가 폐기된 플레이어의 호출부를 건드리면 안 된다. */
  it("페이드 중에 dispose 하면 남은 onended 가 무시된다", async () => {
    const ctx = createFakeContext("running", true);
    const onPlaybackChanged = vi.fn();
    const player = createWebAudioPlayer({
      catalog,
      audioContextFactory: () => ctx as unknown as AudioContext,
      onPlaybackChanged,
    });
    await player.applyMix({ white: 50 });
    await player.applyMix({});
    onPlaybackChanged.mockClear();

    player.dispose();
    ctx.endSource("src3");

    expect(onPlaybackChanged).not.toHaveBeenCalled();
    expect(player.getState()).toBe("idle");
  });

  it("버퍼를 캐시하고 진행 중인 요청도 공유한다", async () => {
    const { ctx, fetchImpl, player } = setup();
    await Promise.all([player.applyMix({ rain: 30 }), player.applyMix({ rain: 30, cafe: 30 })]);
    await player.applyMix({});
    await player.applyMix({ rain: 30 });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledWith("/sounds/rain.mp3");
    expect(fetchImpl).toHaveBeenCalledWith("/sounds/cafe.mp3");
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(2);
  });

  it("실패한 소리는 failed 로 보고하고 그래프에 넣지 않는다", async () => {
    const { ctx, fetchImpl, player } = setup();
    fetchImpl.mockImplementation((input: string) =>
      Promise.resolve(input.endsWith("rain.mp3") ? ({ ok: false } as Response) : okResponse(8)),
    );
    ctx.decodeAudioData.mockRejectedValueOnce(new Error("bad data"));

    const result = await player.applyMix({ unknown: 50, rain: 50, cafe: 50, white: 50 });

    expect(result.failed.sort()).toEqual(["cafe", "rain", "unknown"]);
    expect(ctx.log.filter((line) => line.startsWith("createBufferSource"))).toHaveLength(1);
    expect(player.getState()).toBe("playing");
  });

  it("실패한 소리는 다음 applyMix 에서 다시 시도한다", async () => {
    const { fetchImpl, player } = setup();
    fetchImpl.mockResolvedValueOnce({ ok: false } as Response);
    await expect(player.applyMix({ rain: 50 })).resolves.toEqual({ failed: ["rain"] });
    await expect(player.applyMix({ rain: 50 })).resolves.toEqual({ failed: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("cancelAndHoldAtTime 이 없으면 cancelScheduledValues 와 현재 값 고정으로 폴백한다", async () => {
    const { ctx, player } = setup("running", false);
    await player.applyMix({ white: 50 });
    ctx.log.length = 0;
    ctx.currentTime = 10;

    await player.applyMix({ white: 80 });

    expect(ctx.log).toEqual([
      "gain4.cancel(10)",
      "gain4.set(0.25,10)",
      "gain4.ramp(0.6400000000000001,10.15)",
    ]);
  });

  it("버퍼를 기다리는 동안 꺼진 소리는 시작하지 않는다", async () => {
    const { ctx } = setup();
    let resolveFetch: (r: Response) => void = () => {};
    const fetchImpl = vi.fn(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve)),
    ) as unknown as typeof fetch;
    const p = createWebAudioPlayer({
      catalog,
      audioContextFactory: () => ctx as unknown as AudioContext,
      fetchImpl,
    });
    const first = p.applyMix({ rain: 50 });
    await p.applyMix({});
    resolveFetch(okResponse(4));
    await first;

    expect(ctx.log.filter((line) => line.startsWith("createBufferSource"))).toHaveLength(0);
    expect(p.getState()).toBe("idle");
  });

  it("setDucked 는 덕킹 게인만 1초 램프로 0.4 와 1 사이로 옮긴다", async () => {
    const { ctx, player } = setup();
    await player.applyMix({ white: 50 });
    ctx.log.length = 0;
    ctx.currentTime = 5;

    player.setDucked(true);
    player.setDucked(false);

    // 헤드룸(gain0)은 건드리지 않는다. 한 노드에 겹치면 서로의 램프를 취소한다.
    expect(ctx.log).toEqual([
      "gain1.hold(5)",
      "gain1.ramp(0.4,6)",
      "gain1.hold(5)",
      "gain1.ramp(1,6)",
    ]);
  });

  it("컨텍스트 전에 setDucked 가 오면 덕킹 게인이 낮춘 값으로 시작한다", async () => {
    const { ctx, player } = setup();
    player.setDucked(true);
    await player.applyMix({ white: 50 });
    expect(ctx.log).toContain("gain0.set(0.5,0)");
    expect(ctx.log).toContain("gain1.set(0.4,0)");
  });

  /**
   * 덕킹은 1초, 헤드룸은 150ms 다. 한 게인에 겹쳐 두면 덕킹이 도는 중에 소리 하나만 꺼도
   * 남은 구간이 지워지고 150ms 만에 목표에 닿는다. 노드를 나눠 둬야 각자 자기 시간축을 지킨다.
   */
  it("덕킹이 도는 중에 소리를 꺼도 덕킹 램프가 취소되지 않는다", async () => {
    const { ctx, player } = setup();
    await player.applyMix({ white: 100, pink: 100, brown: 100, rain: 100 });
    ctx.currentTime = 5;
    player.setDucked(true);
    ctx.log.length = 0;
    ctx.currentTime = 5.1;

    await player.applyMix({ white: 100, pink: 100, brown: 100 });

    // 헤드룸(gain0)만 다시 잡히고 덕킹(gain1)에는 아무 명령도 가지 않는다.
    expect(ctx.log.filter((line) => line.startsWith("gain1."))).toEqual([]);
    expect(ctx.log.some((line) => line.startsWith("gain0.ramp"))).toBe(true);
  });

  it("suspend 는 요청 즉시 suspended 이고, resume 은 컨텍스트가 살아난 뒤에야 playing 이다", async () => {
    const { ctx, player } = setup();
    await player.applyMix({ white: 50 });
    ctx.log.length = 0;

    const suspending = player.suspend();
    expect(ctx.state).toBe("running");
    expect(player.getState()).toBe("suspended");
    await suspending;
    expect(ctx.state).toBe("suspended");

    const resuming = player.resume();
    expect(player.getState()).toBe("suspended");
    await resuming;
    expect(player.getState()).toBe("playing");

    expect(ctx.log).toEqual(["suspend", "resume"]);
  });

  it("우리가 부르지 않았는데 멈추면(인터럽션) 켜진 소리가 있는 한 resume 을 다시 시도한다", async () => {
    const { ctx, player } = setup();
    await player.applyMix({ white: 50 });

    ctx.state = "interrupted" as AudioContextState;
    ctx.emit();
    expect(player.getState()).toBe("suspended");
    expect(ctx.resume).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    expect(ctx.state).toBe("running");
    expect(player.getState()).toBe("playing");
  });

  it("우리가 suspend 한 뒤의 statechange 와 빈 믹스의 인터럽션에는 resume 하지 않는다", async () => {
    const { ctx, player } = setup();
    await player.applyMix({ white: 50 });
    await player.suspend();
    expect(ctx.resume).not.toHaveBeenCalled();

    await player.resume();
    await player.applyMix({});
    ctx.resume.mockClear();
    ctx.state = "interrupted" as AudioContextState;
    ctx.emit();
    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it("resume 뒤에도 running 이 아니면 blocked 이고 다음 applyMix 가 다시 시도한다", async () => {
    const { ctx, player } = setup("suspended");
    ctx.resume.mockImplementation(() => {
      ctx.log.push("resume");
      return Promise.resolve();
    });
    await player.applyMix({ white: 50 });
    expect(player.getState()).toBe("blocked");
    expect(ctx.resume).toHaveBeenCalledTimes(1);

    ctx.resume.mockImplementation(() => {
      ctx.log.push("resume");
      return Promise.resolve().then(() => {
        ctx.state = "running";
        ctx.emit();
      });
    });
    await player.applyMix({ white: 50, pink: 50 });
    expect(ctx.resume).toHaveBeenCalledTimes(2);
    expect(player.getState()).toBe("playing");
  });

  it("resume 이 reject 해도 예외 없이 blocked 가 된다", async () => {
    const { ctx, player } = setup();
    await player.applyMix({ white: 50 });
    await player.suspend();
    ctx.resume.mockRejectedValueOnce(new Error("NotAllowedError"));
    await expect(player.resume()).resolves.toBeUndefined();
    expect(player.getState()).toBe("blocked");
  });

  it("일시정지 중 applyMix 는 resume 을 시도하지 않는다", async () => {
    const { ctx, player } = setup();
    await player.applyMix({ white: 50 });
    player.suspend();
    await player.applyMix({ white: 50, pink: 50 });
    expect(ctx.resume).not.toHaveBeenCalled();
    expect(player.getState()).toBe("suspended");
  });

  it("dispose 는 소스를 멈추고 구독을 풀고 컨텍스트를 닫는다. 두 번 불러도 안전하다", async () => {
    const { ctx, player } = setup();
    await player.applyMix({ white: 50, rain: 50 });
    ctx.log.length = 0;

    player.dispose();
    player.dispose();

    expect(ctx.log).toEqual(["src3.stop(0)", "src5.stop(0)", "off:statechange", "close"]);
    expect(ctx.listenerCount()).toBe(0);
    expect(player.getState()).toBe("idle");
    ctx.emit();
    expect(player.getState()).toBe("idle");
  });

  it("dispose 뒤의 명령은 no-op 이고 캐시를 비운다", async () => {
    const { ctx, factory, fetchImpl, player } = setup();
    await player.applyMix({ rain: 50 });
    player.dispose();
    ctx.log.length = 0;

    player.setDucked(true);
    player.suspend();
    player.resume();
    await expect(player.applyMix({ rain: 50 })).resolves.toEqual({ failed: [] });

    expect(ctx.log).toEqual([]);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(player.getState()).toBe("idle");
  });
});

describe("createMemoryPlayer", () => {
  it("명령을 순서대로 기록하고 상태를 갱신한다", async () => {
    const player = createMemoryPlayer();
    expect(player.getState()).toBe("idle");

    await expect(player.applyMix({ white: 50 })).resolves.toEqual({ failed: [] });
    expect(player.getState()).toBe("playing");

    player.setDucked(true);
    void player.suspend();
    expect(player.getState()).toBe("suspended");
    const resuming = player.resume();
    expect(player.getState()).toBe("suspended");
    await resuming;
    expect(player.getState()).toBe("playing");

    await player.applyMix({});
    expect(player.getState()).toBe("idle");

    player.dispose();
    expect(player.getState()).toBe("idle");

    expect(player.commands).toEqual([
      { type: "applyMix", mix: { white: 50 } },
      { type: "setDucked", ducked: true },
      { type: "suspend" },
      { type: "resume" },
      { type: "applyMix", mix: {} },
      { type: "dispose" },
    ]);
  });

  it("믹스가 비어 있으면 resume 해도 idle 이다", async () => {
    const player = createMemoryPlayer();
    await player.suspend();
    await player.resume();
    expect(player.getState()).toBe("idle");
  });
});
