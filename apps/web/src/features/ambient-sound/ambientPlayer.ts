import type { AmbientSound, SoundId } from "./catalog";
import type { Mix } from "./mix";
import { createNoiseSamples } from "./noiseSynth";
import type { NoiseKind } from "./noiseSynth";
import { createSilentKeepAlive } from "./silentKeepAlive";

export type AmbientPlayerState = "idle" | "playing" | "suspended" | "blocked";

export interface AmbientPlayer {
  /** 현재 그래프와의 차이만 반영한다. 불러오지 못한 소리 id 를 failed 로 돌려준다. */
  applyMix(mix: Mix): Promise<{ failed: SoundId[] }>;
  setDucked(ducked: boolean): void;
  /** 컨텍스트 상태가 확정된 뒤 resolve 한다. getState 는 그 뒤에 읽어야 실제와 맞는다. */
  suspend(): Promise<void>;
  resume(): Promise<void>;
  dispose(): void;
  getState(): AmbientPlayerState;
}

const FADE_SEC = 0.15;
const DUCK_SEC = 1;
const DUCK_GAIN = 0.4;
const NOISE_BUFFER_SEC = 4;
/**
 * 마스터 게인의 상한. 소리 버퍼는 저마다 피크 1 이라 여러 개를 최대 레벨로 겹치면 합이 1 을
 * 넘어 출력단에서 하드 클리핑한다. 1/N 로 나누면 절대 안 넘지만 소리 하나만 켰을 때 너무
 * 작다. 노이즈끼리는 상관이 없어 합의 실효값이 게인 제곱합의 제곱근으로 자라므로, 그 제곱합에
 * 마스터의 제곱을 곱한 값을 예산 아래로 두면 몇 개를 겹쳐도 넘지 않는다.
 */
const HEADROOM = 0.5;
/**
 * 제곱합 예산. 겹칠 수 있는 소리 수에 상한이 없어 마스터를 고정값으로 둘 수 없다. 0.75 는
 * 소리 셋을 최대 레벨로 켠 상태(3 × 0.5² = 0.75)에서 뽑은 값이라, 셋까지는 이 식이
 * HEADROOM 을 그대로 돌려주고 넷째부터만 줄어든다.
 */
const POWER_BUDGET = 0.75;

/**
 * 출력단 리미터. 제곱합 예산은 실효값을 다루는 근사라 순간 피크가 같은 방향으로 겹치는
 * 경우까지 막지 못한다. 마지막에 리미터를 한 단 두어야 클리핑이 실제로 보장된다.
 * threshold 아래로는 건드리지 않으므로 평소 소리는 그대로 지나간다.
 */
const LIMITER = {
  threshold: -2,
  knee: 0,
  ratio: 20,
  attack: 0.003,
  release: 0.25,
} as const;

type Voice = { source: AudioBufferSourceNode; gain: GainNode; level: number };

/**
 * 헤드룸 게인 목표값.
 *
 * 믹스가 아니라 실제로 소리를 내고 있는 보이스를 세는 이유는, 파일을 못 받은 소리가 믹스에는
 * 남아 있기 때문이다. 그것까지 세면 나지도 않는 소리 때문에 나머지가 조용해진다.
 */
function headroomGain(voices: ReadonlyMap<SoundId, Voice>): number {
  let power = 0;
  for (const voice of voices.values()) power += levelToGain(voice.level) ** 2;
  if (power === 0) return HEADROOM;
  return Math.min(HEADROOM, Math.sqrt(POWER_BUDGET / power));
}

const NOISE_SEED: Record<NoiseKind, number> = { white: 1, pink: 20260920, brown: 77712043 };

export function isNoiseKind(id: string): id is NoiseKind {
  return id === "white" || id === "pink" || id === "brown";
}

/**
 * 슬라이더 0~100 을 게인 0~1 로 옮길 때 선형이 아니라 제곱을 쓴다. 사람 귀는 로그에
 * 가까워서 선형 매핑은 슬라이더 위쪽 절반이 거의 변화 없게 들린다.
 */
function levelToGain(level: number): number {
  return (level / 100) ** 2;
}

function rampTo(param: AudioParam, target: number, at: number, duration: number): void {
  // cancelScheduledValues 는 진행 중인 램프를 통째로 지워 값이 램프 시작점으로 되감긴다.
  // cancelAndHoldAtTime 은 그 시각의 값을 붙들어 이어서 램프한다. 없는 브라우저는 폴백.
  if (typeof param.cancelAndHoldAtTime === "function") {
    param.cancelAndHoldAtTime(at);
  } else {
    param.cancelScheduledValues(at);
    param.setValueAtTime(param.value, at);
  }
  param.linearRampToValueAtTime(target, at + duration);
}

function defaultAudioContextFactory(): AudioContext | null {
  const Ctor =
    globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

export type WebAudioPlayerOptions = {
  catalog: readonly AmbientSound[];
  audioContextFactory?: () => AudioContext | null;
  fetchImpl?: typeof fetch;
  /**
   * 들리는 상태가 바뀔 때마다 부른다. 보이스의 시작과 페이드아웃 종료, 그리고 우리가 부르지
   * 않은 컨텍스트 멈춤(전화·알람)과 그 복구 시도까지 포함한다.
   *
   * `applyMix` 의 resolve 로만 알면 두 가지를 놓친다. 파일 하나가 늦게 오는 동안 이미 나고
   * 있는 합성음의 시간, 그리고 통화로 멈춘 뒤 되살아나지 못한 구간이다. 뒤쪽은 통화 시간이
   * 통째로 재생 시간에 더해진다.
   */
  onPlaybackChanged?: () => void;
  /**
   * iOS 웹뷰의 무음 스위치용 keep-alive 요소. null 이면 만들지 않는다. 기본은 Apple WebKit
   * 에서만 만드는 `createSilentKeepAlive` 이고, 이유는 `silentKeepAlive.ts` 상단에 있다.
   */
  keepAliveFactory?: () => HTMLAudioElement | null;
};

export function createWebAudioPlayer(options: WebAudioPlayerOptions): AmbientPlayer {
  const {
    catalog,
    audioContextFactory = defaultAudioContextFactory,
    fetchImpl = fetch,
    onPlaybackChanged,
    keepAliveFactory = createSilentKeepAlive,
  } = options;
  const sounds = new Map(catalog.map((sound) => [sound.id, sound]));

  let ctx: AudioContext | null = null;
  // 헤드룸과 덕킹을 한 게인에 겹치면 서로의 램프를 취소한다. 덕킹은 1초, 헤드룸은 150ms 라
  // 덕킹이 도는 중에 소리 하나만 꺼도 남은 구간이 지워지고 150ms 만에 목표에 닿는다.
  // 노드를 둘로 나누면 각자 자기 시간축을 갖고, 곱은 그래프가 알아서 해 준다.
  let headroom: GainNode | null = null;
  let duck: GainNode | null = null;
  let limiter: DynamicsCompressorNode | null = null;
  // 마지막으로 건 헤드룸 목표값. 슬라이더를 움직일 때마다 같은 값을 다시 예약하지 않으려고 둔다.
  let headroomTarget = HEADROOM;
  const voices = new Map<SoundId, Voice>();
  const buffers = new Map<SoundId, Promise<AudioBuffer>>();
  let desired: Mix = {};
  let ducked = false;
  let suspendRequested = false;
  // undefined 는 아직 안 만든 것, null 은 이 엔진에서는 안 만든다는 뜻이다. 켜져 있는지는 따로
  // 들고 있지 않고 요소의 paused 를 본다. 시스템이 요소를 멈춘 경우(재개되지 않는 인터럽션,
  // 잠금화면의 정지)를 우리 플래그로는 알 수 없어서다.
  let keepAlive: HTMLAudioElement | null | undefined;
  const keepAlivePlay = (): void => {
    if (keepAlive === undefined) {
      try {
        keepAlive = keepAliveFactory();
      } catch {
        keepAlive = null;
      }
    }
    if (!keepAlive || !keepAlive.paused) return;
    // 자동재생 거부는 삼킨다. 요소가 못 돌면 무음 스위치를 못 넘길 뿐 소리 재생은 그대로다.
    // 거부되면 paused 가 그대로 남아 다음 조작에서 자연히 다시 걸린다.
    try {
      const played: unknown = keepAlive.play();
      if (played instanceof Promise) played.catch(() => undefined);
    } catch {
      // play 미구현 환경이나 동기 예외. 위와 같은 이유로 무시한다.
    }
  };
  const keepAlivePause = (): void => {
    if (keepAlive && !keepAlive.paused) keepAlive.pause();
  };
  let blocked = false;
  let disposed = false;

  // 페이드아웃이 끝나기 전까지는 아직 들린다. 보이스는 곧바로 지워야 다시 켤 때 새로
  // 시작되므로, 꺼지는 중인 소스를 따로 들고 있는다. 개수가 아니라 소스를 들고 있어야
  // dispose 가 남은 핸들러를 무효화할 수 있다.
  const fading = new Set<AudioBufferSourceNode>();
  const runningState = (): AmbientPlayerState =>
    voices.size > 0 || fading.size > 0 ? "playing" : "idle";

  // 컨텍스트 state 는 suspend() 뒤 한 박자 늦게 바뀌므로 우리가 멈추기로 한 사실을 먼저 본다.
  const getState = (): AmbientPlayerState => {
    if (!ctx) return "idle";
    if (suspendRequested) return "suspended";
    if (ctx.state === "running") return runningState();
    return blocked ? "blocked" : "suspended";
  };

  /**
   * 들리는 상태가 실제로 바뀌었을 때만 알린다. 보이스가 둘 늘어도 재생은 재생이라,
   * 바뀌지 않은 상태를 거듭 보내면 호출부가 같은 일을 몇 번씩 하게 된다.
   */
  let lastNotified: AmbientPlayerState | null = null;
  const notify = (): void => {
    const next = getState();
    if (next === lastNotified) return;
    lastNotified = next;
    // 들리는 동안만 keep-alive 를 돌린다. 인터럽션에서 돌아온 경우도 여기서 다시 건다.
    // suspended·blocked 에서는 건드리지 않는다. 깨우는 도중의 잠깐을 멈춤으로 오해해 껐다 켜면
    // 두 번째 play 가 제스처 밖이라 거부될 수 있다.
    if (next === "playing") keepAlivePlay();
    else if (next === "idle") keepAlivePause();
    onPlaybackChanged?.();
  };

  const tryResume = (): Promise<void> => {
    const context = ctx;
    if (!context) return Promise.resolve();
    return context.resume().then(
      () => {
        blocked = context.state !== "running";
        notify();
      },
      () => {
        blocked = true;
        notify();
      },
    );
  };

  // 우리가 부르지 않았는데 멈춘 것(iOS 전화·알람 인터럽션)은 켜진 소리가 있는 한 되살린다.
  const onStateChange = (): void => {
    if (!ctx) return;
    if (ctx.state === "running") {
      blocked = false;
      notify();
      return;
    }
    // 우리가 부르지 않은 멈춤은 그 자체로 소리가 끊긴 것이다. 되살리기를 시도하되 지금
    // 멈췄다는 사실을 먼저 알려야, 복구가 실패해도 재생 시간이 계속 늘지 않는다.
    if (!suspendRequested) notify();
    if (!suspendRequested && voices.size > 0) void tryResume();
  };

  const ensureContext = (): AudioContext | null => {
    if (ctx) return ctx;
    try {
      ctx = audioContextFactory();
    } catch {
      ctx = null;
    }
    if (!ctx) return null;
    headroom = ctx.createGain();
    duck = ctx.createGain();
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = LIMITER.threshold;
    limiter.knee.value = LIMITER.knee;
    limiter.ratio.value = LIMITER.ratio;
    limiter.attack.value = LIMITER.attack;
    limiter.release.value = LIMITER.release;
    headroom.connect(duck);
    duck.connect(limiter);
    limiter.connect(ctx.destination);
    headroomTarget = headroomGain(voices);
    headroom.gain.setValueAtTime(headroomTarget, ctx.currentTime);
    duck.gain.setValueAtTime(ducked ? DUCK_GAIN : 1, ctx.currentTime);
    ctx.addEventListener("statechange", onStateChange);
    // 일시정지된 채로 컨텍스트가 처음 만들어지는 경로가 있다. 세션이 멈춰 있는 동안 슬라이더를
    // 올리는 경우인데, 새 컨텍스트는 running 으로 태어나므로 여기서 다시 멈추지 않으면 소리가 난다.
    if (suspendRequested) void ctx.suspend().catch(() => {});
    return ctx;
  };

  const loadBuffer = (context: AudioContext, sound: AmbientSound): Promise<AudioBuffer> => {
    if (sound.kind === "synth") {
      if (!isNoiseKind(sound.id)) return Promise.reject(new Error(`unknown synth: ${sound.id}`));
      const length = context.sampleRate * NOISE_BUFFER_SEC;
      const buffer = context.createBuffer(1, length, context.sampleRate);
      // 시드를 종류마다 다르게 준다. 같은 시드면 핑크·브라운이 화이트와 같은 난수열을 거른
      // 것이라 서로 상관을 갖고, 겹쳐 켰을 때 피크가 같은 자리에서 몰린다.
      buffer.getChannelData(0).set(createNoiseSamples(sound.id, length, NOISE_SEED[sound.id]));
      return Promise.resolve(buffer);
    }
    return fetchImpl(`/sounds/${sound.file}`)
      .then((response) => {
        if (!response.ok) throw new Error(`fetch failed: ${sound.file} (${response.status})`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data));
  };

  const getBuffer = (context: AudioContext, sound: AmbientSound): Promise<AudioBuffer> => {
    let pending = buffers.get(sound.id);
    if (!pending) {
      // 실패한 항목은 캐시에서 빼서 다음 applyMix 가 다시 시도할 수 있게 한다.
      pending = loadBuffer(context, sound).catch((error: unknown) => {
        buffers.delete(sound.id);
        throw error;
      });
      buffers.set(sound.id, pending);
    }
    return pending;
  };

  /** 헤드룸을 재생 중인 보이스에 맞춘다. 값이 그대로면 램프를 예약하지 않는다. */
  const syncHeadroom = (context: AudioContext): void => {
    const next = headroomGain(voices);
    if (!headroom || next === headroomTarget) return;
    headroomTarget = next;
    rampTo(headroom.gain, next, context.currentTime, FADE_SEC);
  };

  const startVoice = (
    context: AudioContext,
    id: SoundId,
    buffer: AudioBuffer,
    level: number,
  ): void => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = context.createGain();
    source.connect(gain);
    gain.connect(headroom as GainNode);
    const now = context.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(levelToGain(level), now + FADE_SEC);
    source.start(now);
    voices.set(id, { source, gain, level });
    // 보이스가 하나 늘 때마다 즉시 맞춘다. 느린 파일 하나를 기다리는 동안 먼저 시작한
    // 소리들이 예전 헤드룸으로 계속 나면 그 사이가 클리핑 구간이 된다.
    syncHeadroom(context);
    notify();
  };

  const stopVoice = (context: AudioContext, id: SoundId, voice: Voice): void => {
    const now = context.currentTime;
    rampTo(voice.gain.gain, 0, now, FADE_SEC);
    // 페이드가 끝나야 진짜 멈춘 것이다. 그 전에 재생 시간을 끊으면 끄고 켤 때마다 150ms 씩
    // 빠진다. 헤드룸은 지금 올려도 되는데, 남은 소리가 바로 커져야 자연스럽기 때문이다.
    fading.add(voice.source);
    voice.source.onended = () => {
      // dispose 가 이미 걷어 갔으면 아무 일도 하지 않는다.
      if (fading.delete(voice.source)) notify();
    };
    voice.source.stop(now + FADE_SEC);
    voices.delete(id);
    syncHeadroom(context);
    notify();
  };

  return {
    async applyMix(mix) {
      if (disposed) return { failed: [] };
      desired = mix;
      const ids = Object.keys(mix);
      if (!ctx && ids.length === 0) return { failed: [] };
      const context = ensureContext();
      if (!context) return { failed: [] };

      /**
       * 버퍼를 기다리기 **전에** 깨운다. iOS 사파리는 사용자 조작의 호출 스택 안에서 부른
       * resume 만 받아들이는데, 파일을 받고 디코딩한 뒤에 부르면 그때는 이미 조작이 끝나 있어
       * 무시된다. 컨텍스트가 suspended 로 남고 소리가 나지 않는다.
       *
       * 합성음도 마찬가지다. 버퍼 생성 자체는 동기여도 await 를 한 번 거치는 순간 제스처 밖이다.
       */
      const needsWake = ids.length > 0 && !suspendRequested && context.state !== "running";
      const waking = needsWake ? tryResume() : Promise.resolve();
      // 같은 이유로 keep-alive 도 버퍼를 기다리기 전에 건다. play 도 제스처 스택 안이어야 한다.
      if (ids.length > 0 && !suspendRequested) keepAlivePlay();

      for (const [id, voice] of voices) {
        if (!(id in mix)) stopVoice(context, id, voice);
      }
      const failed: SoundId[] = [];
      await Promise.all(
        ids.map(async (id) => {
          const level = mix[id] as number;
          const voice = voices.get(id);
          if (voice) {
            if (voice.level !== level) {
              rampTo(voice.gain.gain, levelToGain(level), context.currentTime, FADE_SEC);
              voice.level = level;
              syncHeadroom(context);
            }
            return;
          }
          const sound = sounds.get(id);
          if (!sound) {
            failed.push(id);
            return;
          }
          try {
            const buffer = await getBuffer(context, sound);
            // 기다리는 사이 꺼졌거나 이미 시작됐거나 dispose 됐으면 시작하지 않는다.
            if (disposed || !(id in desired) || voices.has(id)) return;
            startVoice(context, id, buffer, desired[id] as number);
          } catch {
            failed.push(id);
          }
        }),
      );

      await waking;
      // 위에서 이미 깨웠으면 다시 부르지 않는다. 기다리는 사이 멈춘 경우만 여기서 잡는다.
      if (!needsWake && !disposed && !suspendRequested && context.state !== "running") {
        await tryResume();
      }
      // 켜려던 소리가 하나도 시작되지 못하면 상태 알림이 오지 않는다. 그때 요소만 계속 돌면
      // 소리 없이 미디어 세션만 쥐고 있는 꼴이라 여기서 거둔다. 그 사이 새 믹스가 들어왔으면
      // 그쪽 호출이 판단할 몫이라 건드리지 않는다.
      if (!disposed && desired === mix && runningState() === "idle") keepAlivePause();
      return { failed };
    },

    setDucked(next) {
      if (ducked === next) return;
      ducked = next;
      if (!ctx || !duck) return;
      rampTo(duck.gain, ducked ? DUCK_GAIN : 1, ctx.currentTime, DUCK_SEC);
    },

    async suspend() {
      if (disposed) return;
      suspendRequested = true;
      keepAlivePause();
      await ctx?.suspend().catch(() => {});
    },

    async resume() {
      if (disposed) return;
      suspendRequested = false;
      // 재개는 상태 알림이 중복으로 걸러질 수 있어 여기서 직접 건다.
      if (runningState() === "playing") keepAlivePlay();
      await tryResume();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      keepAlivePause();
      keepAlive = null;
      if (ctx) {
        // 페이드 중인 소스는 voices 에 없다. 핸들러를 먼저 끊어야 늦게 오는 onended 가
        // 폐기된 뒤에 호출부를 건드리지 않는다.
        for (const source of fading) {
          source.onended = null;
          source.stop();
        }
        for (const voice of voices.values()) voice.source.stop();
        ctx.removeEventListener("statechange", onStateChange);
        ctx.close().catch(() => {});
      }
      voices.clear();
      fading.clear();
      buffers.clear();
      ctx = null;
      headroom = null;
      duck = null;
      limiter = null;
    },

    getState,
  };
}

export type MemoryPlayerCommand =
  | { type: "applyMix"; mix: Mix }
  | { type: "setDucked"; ducked: boolean }
  | { type: "suspend" }
  | { type: "resume" }
  | { type: "dispose" };

/**
 * 테스트용. 명령을 기록만 하고 상태는 명령에 따라 갱신한다. resume 만은 실제 컨텍스트처럼
 * promise 가 settle 된 뒤에 playing 이 된다 — 훅이 명령 직후 상태를 읽는 회귀를 잡기 위해서다.
 */
export function createMemoryPlayer(): AmbientPlayer & { commands: MemoryPlayerCommand[] } {
  const commands: MemoryPlayerCommand[] = [];
  let hasMix = false;
  let state: AmbientPlayerState = "idle";
  const running = (): AmbientPlayerState => (hasMix ? "playing" : "idle");
  return {
    commands,
    applyMix(mix) {
      commands.push({ type: "applyMix", mix });
      hasMix = Object.keys(mix).length > 0;
      if (state !== "suspended") state = running();
      return Promise.resolve({ failed: [] });
    },
    setDucked(ducked) {
      commands.push({ type: "setDucked", ducked });
    },
    suspend() {
      commands.push({ type: "suspend" });
      state = "suspended";
      return Promise.resolve();
    },
    resume() {
      commands.push({ type: "resume" });
      return Promise.resolve().then(() => {
        state = running();
      });
    },
    dispose() {
      commands.push({ type: "dispose" });
      hasMix = false;
      state = "idle";
    },
    getState: () => state,
  };
}
