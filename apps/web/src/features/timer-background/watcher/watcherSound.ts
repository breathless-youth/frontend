import { createSilentKeepAlive } from "@/features/ambient-sound/silentKeepAlive";

import { watchSoundUrl } from "../spaceFiles";
import { readWatcherAsset } from "./watcherAssets";

/**
 * 공간 소리 이름
 *
 * 감독관 발소리의 등장·퇴장은 그 클립 영상에 맞춘 소리이고, approach는 등장 직전 멀리서 다가오는 소리다.
 * 비집중 장면은 바뀌기 직전의 approach와 바뀌는 순간의 cue를 쓴다.
 */
export type SpaceCue = "approach" | "enter" | "exit" | "cue";

/** 다가오다 다시 집중하면 발소리가 멀어지듯 줄어드는 시간 */
const FADE_OUT_SEC = 0.6;

/** 내 화면을 키워 소리를 끌 때 딸깍 소리 없이 줄이는 시간 */
const MUTE_FADE_SEC = 0.2;

/** 소리를 못 받으면 이 간격으로 이만큼 다시 받는다. */
const RETRY_MS = 1_000;
const MAX_RETRIES = 3;

export interface CueSound {
  /** 소리를 미리 받아 두고 컨텍스트와 무음 루프를 깨운다. iOS 브라우저는 사용자 누름 안에서 불러야 이후 재생을 허락한다. */
  prime(): void;
  /**
   * `offsetSec`은 영상이 이미 지나간 시간이라 소리도 그만큼 건너뛰어 발걸음에 맞춘다.
   * 컨텍스트가 멈춰 있거나 소리를 아직 받는 중이면 준비되는 대로 늦은 만큼 더 건너뛰어 울린다.
   */
  play(cue: SpaceCue, offsetSec?: number): void;
  /** 다가오던 발소리만 줄여 끈다. */
  fadeApproach(): void;
  /**
   * 받은 소리의 길이(초)
   * 넘기지 않은 소리이거나 끝내 받지 못하면 null이다.
   */
  durationSec(cue: SpaceCue): Promise<number | null>;
  /** 켜면 나던 소리를 줄여 끄고 새 소리를 내지 않는다. 끄면 다음 소리부터 다시 난다. */
  setMuted(muted: boolean): void;
  /** 0~1. 멀고 가까운 크기 차이는 소리 파일에 담겨 있고 여기서는 전체 크기만 바꾼다. 0이면 새 소리를 내지 않는다. */
  setVolume(volume: number): void;
  stopAll(): void;
  dispose(): void;
}

/** 감독관 재생기는 감독 공간 소리 주소로 만든 공간 소리 재생기다. */
export type WatcherSound = CueSound;

function defaultCreateContext(): AudioContext {
  const Ctor =
    globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error("AudioContext unsupported");
  return new Ctor();
}

/** 적용할 때 받아 둔 소리가 있으면 그것을, 없으면 네트워크에서 받는다. */
async function loadSound(url: string): Promise<ArrayBuffer> {
  const stored = await readWatcherAsset(url);
  if (stored instanceof Blob) return stored.arrayBuffer();
  return (await fetch(url)).arrayBuffer();
}

/**
 * 공간 소리 재생기
 *
 * 소리는 공간마다 따로 있어 부른 쪽이 공간 폴더의 소리 주소를 넘긴다.
 * 영상은 계속 음소거로 두고 소리를 따로 낸다. 소리 있는 영상은 브라우저가 자동 재생을 막아 영상까지 멈출 수 있고,
 * iOS는 영상 볼륨을 바꿀 수 없어 다가오던 소리를 줄이며 끄지 못해서다.
 * 배경음과 같이 감독관이 켜져 있는 동안 무음 루프를 틀어 iOS 무음 스위치와 상관없이 기기 음량을 따른다.
 * 발소리는 띄엄띄엄 나는데 iOS는 화면을 누를 때만 미디어 재생을 허락해서, 누를 때마다 부르는 `prime()`에서 무음 루프를 켜 두고 계속 돌린다.
 * 소리가 막혀도 감독관 영상은 그대로 돌아야 해서 어떤 예외도 밖으로 내보내지 않는다.
 */
export function createCueSound(
  urls: Readonly<Partial<Record<SpaceCue, string>>>,
  createContext: () => AudioContext = defaultCreateContext,
  load: (url: string) => Promise<ArrayBuffer> = loadSound,
  keepAliveFactory: () => HTMLAudioElement | null = createSilentKeepAlive,
): CueSound {
  const cues = Object.keys(urls) as SpaceCue[];
  let context: AudioContext | null = null;
  const buffers = new Map<SpaceCue, Promise<AudioBuffer | null>>();
  const ready = new Map<SpaceCue, AudioBuffer>();
  // 준비를 기다리는 재생 요청. 멈추거나 새로 틀면 바뀌어 늦게 깨어난 옛 요청이 울리지 않는다.
  const pending = new Map<SpaceCue, object>();
  const voices = new Map<SpaceCue, { source: AudioBufferSourceNode; gain: GainNode }>();
  let muted = false;
  let volume = 1;
  // prime으로 켜고 stopAll·dispose로 끈다. 감독관이 아닌 공간에서 음량만 바꿔도 무음 루프가 돌지 않게 한다.
  // 심플 모드와 키운 카메라의 음소거는 잠깐이라 무음 루프를 그대로 둔다. 멈추면 돌아올 때 화면을 눌러야만 다시 틀 수 있다.
  let active = false;
  // undefined는 아직 안 만든 것, null은 이 엔진에서는 만들지 않는다는 뜻이다.
  let keepAlive: HTMLAudioElement | null | undefined;
  // 정리한 뒤 늦게 온 누름이나 재생 요청이 닫지 못할 컨텍스트와 무음 루프를 새로 만들지 않게 막는다.
  let disposed = false;
  const syncKeepAlive = (): void => {
    if (!active || volume === 0) {
      if (keepAlive && !keepAlive.paused) keepAlive.pause();
      return;
    }
    if (keepAlive === undefined) {
      try {
        keepAlive = keepAliveFactory();
      } catch {
        keepAlive = null;
      }
    }
    if (!keepAlive || !keepAlive.paused) return;
    // 재생이 거부되면 무음 스위치를 넘지 못할 뿐 발소리는 그대로 내고, 다음에 누를 때 다시 시도한다.
    try {
      const played: unknown = keepAlive.play();
      if (played instanceof Promise) played.catch(() => undefined);
    } catch {
      // play가 동기로 실패한 경우도 위와 같이 무시한다.
    }
  };

  const ensureRunning = (): AudioContext | null => {
    if (disposed) return null;
    try {
      context ??= createContext();
      if (context.state !== "running") void context.resume().catch(() => undefined);
      return context;
    } catch {
      return null;
    }
  };

  // 못 받으면 바로 1초 간격으로 다시 받고, 그래도 안 되면 기록을 비워 다음 재생 요청 때 다시 받는다.
  const loadCue = (current: AudioContext, cue: SpaceCue, url: string) => {
    const attempt = (retried: number): Promise<AudioBuffer | null> =>
      load(url)
        .then((data) => current.decodeAudioData(data))
        .then((buffer) => {
          ready.set(cue, buffer);
          return buffer;
        })
        .catch(() =>
          retried < MAX_RETRIES && context === current
            ? new Promise((resolve) => setTimeout(resolve, RETRY_MS)).then(() =>
                context === current ? attempt(retried + 1) : null,
              )
            : null,
        );
    const loading: Promise<AudioBuffer | null> = attempt(0).then((buffer) => {
      if (!buffer && buffers.get(cue) === loading) buffers.delete(cue);
      return buffer;
    });
    buffers.set(cue, loading);
  };

  const loadAll = (current: AudioContext) => {
    for (const cue of cues) {
      const url = urls[cue];
      if (url !== undefined && !buffers.has(cue)) loadCue(current, cue, url);
    }
  };

  const stop = (cue: SpaceCue, afterSec = 0) => {
    pending.delete(cue);
    const voice = voices.get(cue);
    if (!voice || !context) return;
    voices.delete(cue);
    try {
      const now = context.currentTime;
      if (afterSec > 0) {
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0, now + afterSec);
      }
      voice.source.stop(now + afterSec);
    } catch {
      // 이미 끝난 소리를 멈추는 예외는 무시한다.
    }
  };

  const start = (current: AudioContext, cue: SpaceCue, buffer: AudioBuffer, at: number) => {
    try {
      const source = current.createBufferSource();
      const gain = current.createGain();
      source.buffer = buffer;
      gain.gain.value = volume;
      source.connect(gain).connect(current.destination);
      source.onended = () => {
        if (voices.get(cue)?.source === source) voices.delete(cue);
      };
      source.start(0, at);
      voices.set(cue, { source, gain });
    } catch {
      // 소리를 못 내도 영상은 이어진다.
    }
  };

  return {
    prime() {
      if (disposed) return;
      active = true;
      syncKeepAlive();
      const current = ensureRunning();
      if (current) loadAll(current);
    },
    play(cue, offsetSec = 0) {
      // 앱을 떠난 동안에도 영상이 다음 클립을 틀 수 있어 숨겨진 화면에서는 소리를 내지 않는다.
      if (muted || volume === 0 || document.hidden || urls[cue] === undefined) return;
      const current = ensureRunning();
      if (current === null) return;
      loadAll(current);
      stop(cue);
      const request = {};
      pending.set(cue, request);
      const requestedAt = performance.now();
      const begin = () => {
        const buffer = ready.get(cue);
        // 멈춘 컨텍스트에 예약한 소리는 깨어날 때 뒤늦게 울리므로 깨어난 뒤에만 시작한다.
        if (pending.get(cue) !== request || context !== current || current.state !== "running")
          return;
        pending.delete(cue);
        const at = offsetSec + (performance.now() - requestedAt) / 1000;
        if (!buffer || at >= buffer.duration) return;
        start(current, cue, buffer, at);
      };
      if (current.state === "running" && ready.has(cue)) {
        begin();
        return;
      }
      void Promise.all([current.resume(), buffers.get(cue)]).then(begin, () => undefined);
    },
    fadeApproach() {
      stop("approach", FADE_OUT_SEC);
    },
    durationSec(cue) {
      const current = urls[cue] === undefined ? null : ensureRunning();
      if (current === null) return Promise.resolve(null);
      loadAll(current);
      return (buffers.get(cue) ?? Promise.resolve(null)).then((buffer) => buffer?.duration ?? null);
    },
    setMuted(next) {
      muted = next;
      if (muted) for (const cue of cues) stop(cue, MUTE_FADE_SEC);
    },
    setVolume(next) {
      volume = Math.min(1, Math.max(0, next));
      syncKeepAlive();
      for (const voice of voices.values()) {
        try {
          voice.gain.gain.setValueAtTime(volume, context?.currentTime ?? 0);
        } catch {
          // 이미 끝난 소리는 무시한다.
        }
      }
    },
    stopAll() {
      for (const cue of cues) stop(cue);
      active = false;
      syncKeepAlive();
    },
    dispose() {
      disposed = true;
      for (const cue of cues) stop(cue);
      active = false;
      syncKeepAlive();
      // 닫힌 컨텍스트에서 받다 실패한 기록이 남으면 다음 컨텍스트가 다시 받지 않는다.
      buffers.clear();
      ready.clear();
      const current = context;
      context = null;
      try {
        void current?.close().catch(() => undefined);
      } catch {
        // 이미 닫힌 컨텍스트는 정리 단계라 무시한다.
      }
    },
  };
}

/**
 * 감독 공간 소리 재생기
 * 소리는 감독 공간마다 따로 있어 공간 폴더에서 받는다.
 */
export function createWatcherSound(
  assetKey: string,
  createContext?: () => AudioContext,
  load?: (url: string) => Promise<ArrayBuffer>,
  keepAliveFactory?: () => HTMLAudioElement | null,
): WatcherSound {
  return createCueSound(
    {
      approach: watchSoundUrl(assetKey, "approach"),
      enter: watchSoundUrl(assetKey, "enter"),
      exit: watchSoundUrl(assetKey, "exit"),
    },
    createContext,
    load,
    keepAliveFactory,
  );
}

// 배경음 페이지의 `감독관 발소리` 음량(0~100). 설정 화면과 세션 화면이 다른 웹뷰라 localStorage에 둔다.
const VOLUME_KEY = "focusmakers.watcherSound.volume";
// 끈 발소리를 다시 켤 때 돌아갈 음량. 배경음의 마지막 조합처럼 다음 공부에도 남긴다.
const LAST_VOLUME_KEY = "focusmakers.watcherSound.lastVolume";

/** 처음이거나 읽지 못하면 80이다. 100이 소리 파일에 맞춰 둔 크기다. */
export const DEFAULT_WATCHER_VOLUME = 80;

function readLevel(key: string): number | null {
  try {
    const stored = Number(localStorage.getItem(key) ?? Number.NaN);
    return Number.isFinite(stored) && stored >= 0 && stored <= 100 ? stored : null;
  } catch {
    return null;
  }
}

/** 지금 음량과, 꺼져 있으면 다시 켤 때 돌아갈 음량 */
export function readWatcherVolume(): { level: number; last: number } {
  const level = readLevel(VOLUME_KEY) ?? DEFAULT_WATCHER_VOLUME;
  return { level, last: readLevel(LAST_VOLUME_KEY) || level || DEFAULT_WATCHER_VOLUME };
}

export function writeWatcherVolume(level: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(level));
    if (level > 0) localStorage.setItem(LAST_VOLUME_KEY, String(level));
  } catch {
    // 저장하지 못하면 다음 세션은 기본 크기로 시작한다.
  }
}
