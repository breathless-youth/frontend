import { createSilentKeepAlive } from "@/features/ambient-sound/silentKeepAlive";

/** 음량을 바꿀 때 딸깍 소리 없이 따라가는 시간 상수(초) */
const VOLUME_SMOOTHING_SEC = 0.05;
/** 장면이 바뀔 때 반복 소리를 옮겨 가는 시간(초) */
const SCENE_FADE_SEC = 1;

export interface LoopSound {
  /** 컨텍스트를 깨우고 소리를 받아 둔다. iOS는 사용자 누름 안에서 불러야 이후 재생을 허락한다. */
  prime(): void;
  /** 켜져 있는 동안만 반복 재생한다. 받는 중이면 다 받은 뒤에 시작한다. */
  setActive(active: boolean): void;
  /** 0~1 */
  setVolume(volume: number): void;
  /** 장면에 따라 음량에 곱하는 크기(0~1)이고, 바뀌면 1초 동안 옮겨 간다. */
  fade(level: number): void;
  dispose(): void;
}

function defaultCreateContext(): AudioContext {
  const Ctor =
    globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error("AudioContext unsupported");
  return new Ctor();
}

async function defaultLoad(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`loop sound ${response.status}`);
  return response.arrayBuffer();
}

/**
 * 공간 반복 소리 재생기
 *
 * 영상은 음소거로 따로 돌고, 소리는 Web Audio 버퍼를 loop로 틀어 이음매 없이 반복한다.
 * 감독관 소리처럼 켜져 있는 동안 무음 루프를 함께 틀어 iOS 무음 스위치와 상관없이 기기 음량을 따른다.
 * 소리가 막혀도 공간 영상은 그대로 돌아야 해서 어떤 예외도 밖으로 내보내지 않는다.
 */
export function createLoopSound(
  url: string,
  createContext: () => AudioContext = defaultCreateContext,
  load: (url: string) => Promise<ArrayBuffer> = defaultLoad,
  keepAliveFactory: () => HTMLAudioElement | null = createSilentKeepAlive,
): LoopSound {
  let context: AudioContext | null = null;
  let gain: GainNode | null = null;
  let buffer: AudioBuffer | null = null;
  let loading: Promise<void> | null = null;
  let source: AudioBufferSourceNode | null = null;
  let active = false;
  let volume = 1;
  let level = 1;
  // undefined는 아직 안 만든 것, null은 이 엔진에서는 만들지 않는다는 뜻이다.
  let keepAlive: HTMLAudioElement | null | undefined;

  const syncKeepAlive = (): void => {
    if (!active || volume === 0) {
      if (keepAlive && !keepAlive.paused) keepAlive.pause();
      return;
    }
    playKeepAlive();
  };

  // iOS는 사용자 누름 안에서 튼 미디어만 허락해서, 깨울 때는 꺼져 있거나 음량이 0이어도 먼저 켜 둔다.
  // 재개나 음소거 해제를 누른 그 동작이 지나간 뒤에 켜려 하면 거절된다.
  const playKeepAlive = (): void => {
    if (keepAlive === undefined) {
      try {
        keepAlive = keepAliveFactory();
      } catch {
        keepAlive = null;
      }
    }
    if (!keepAlive || !keepAlive.paused) return;
    // 재생이 거부되면 무음 스위치를 넘지 못할 뿐 소리는 그대로 내고, 다음에 누를 때 다시 시도한다.
    try {
      const played: unknown = keepAlive.play();
      if (played instanceof Promise) played.catch(() => undefined);
    } catch {
      // play가 동기로 실패한 경우도 위와 같이 무시한다.
    }
  };

  const followGain = (timeConstant: number): void => {
    try {
      if (context && gain) {
        gain.gain.setTargetAtTime(volume * level, context.currentTime, timeConstant);
      }
    } catch {
      // 음량을 못 바꿔도 재생은 이어 간다.
    }
  };

  const stopSource = (): void => {
    try {
      source?.stop();
    } catch {
      // 이미 멈춘 소스다.
    }
    source = null;
  };

  const sync = (): void => {
    syncKeepAlive();
    if (!active || !context || !gain || !buffer) {
      stopSource();
      return;
    }
    if (source) return;
    try {
      const next = context.createBufferSource();
      next.buffer = buffer;
      next.loop = true;
      next.connect(gain);
      next.start();
      source = next;
    } catch {
      source = null;
    }
  };

  const ensureContext = (): void => {
    try {
      if (!context) {
        context = createContext();
        gain = context.createGain();
        gain.gain.value = volume * level;
        gain.connect(context.destination);
      }
      if (context.state !== "running") void context.resume().catch(() => undefined);
    } catch {
      context = null;
      gain = null;
    }
  };

  // 받지 못하면 기록을 비워 다음에 켜거나 깨울 때 다시 받는다.
  // 정리한 뒤 늦게 끝난 요청은 컨텍스트가 달라 버리고, 새 요청의 기록도 지우지 않는다.
  const ensureBuffer = (): void => {
    const current = context;
    if (!current || buffer || loading) return;
    const request: Promise<void> = load(url)
      .then((data) => current.decodeAudioData(data))
      .then((decoded) => {
        if (context !== current) return;
        buffer = decoded;
        sync();
      })
      .catch(() => undefined)
      .finally(() => {
        if (loading === request) loading = null;
      });
    loading = request;
  };

  return {
    prime() {
      ensureContext();
      ensureBuffer();
      playKeepAlive();
    },
    setActive(next) {
      active = next;
      if (next) {
        ensureContext();
        ensureBuffer();
      }
      sync();
    },
    setVolume(next) {
      volume = next;
      followGain(VOLUME_SMOOTHING_SEC);
      syncKeepAlive();
    },
    fade(next) {
      level = next;
      // setTargetAtTime은 시간 상수의 세 배에서 목표의 95%에 닿아서 1초에 맞추려고 3으로 나눈다.
      followGain(SCENE_FADE_SEC / 3);
    },
    // 다시 켜면 컨텍스트를 새로 만들어 이어 쓸 수 있다.
    // 개발 모드의 StrictMode는 효과를 정리했다가 같은 재생기로 다시 설정한다.
    dispose() {
      active = false;
      stopSource();
      syncKeepAlive();
      const closing = context;
      context = null;
      gain = null;
      buffer = null;
      loading = null;
      try {
        void closing?.close().catch(() => undefined);
      } catch {
        // 이미 닫힌 컨텍스트는 정리 단계라 무시한다.
      }
    },
  };
}
