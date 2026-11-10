import { readWatcherAsset } from "./watcherAssets";
import { WATCHER_ASSET_DIR, type WatcherClip } from "./watcherClips";

/** 감독관 발소리. 등장·퇴장은 그 클립 영상에 맞춘 소리이고, approach는 등장 직전 멀리서 다가오는 소리다. */
export type WatcherCue = "approach" | Extract<WatcherClip, "enter" | "exit">;

const CUES: readonly WatcherCue[] = ["approach", "enter", "exit"];

/** 다가오다 다시 집중하면 발소리가 멀어지듯 줄어드는 시간 */
const FADE_OUT_SEC = 0.6;

/** 내 화면을 키워 소리를 끌 때 딸깍 소리 없이 줄이는 시간 */
const MUTE_FADE_SEC = 0.2;

export interface WatcherSound {
  /** 소리를 미리 받아 두고 컨텍스트를 깨운다. iOS 브라우저는 사용자 누름 안에서 불러야 이후 재생을 허락한다. */
  prime(): void;
  /**
   * `offsetSec`은 영상이 이미 지나간 시간이라 소리도 그만큼 건너뛰어 발걸음에 맞춘다.
   * 컨텍스트가 멈춰 있거나 소리를 아직 받는 중이면 준비되는 대로 늦은 만큼 더 건너뛰어 울린다.
   */
  play(cue: WatcherCue, offsetSec?: number): void;
  /** 다가오던 발소리만 줄여 끈다. */
  fadeApproach(): void;
  /** 켜면 나던 소리를 줄여 끄고 새 소리를 내지 않는다. 끄면 다음 소리부터 다시 난다. */
  setMuted(muted: boolean): void;
  /** 0~1. 멀고 가까운 크기 차이는 소리 파일에 담겨 있고 여기서는 전체 크기만 바꾼다. 0이면 새 소리를 내지 않는다. */
  setVolume(volume: number): void;
  stopAll(): void;
  dispose(): void;
}

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
  if (stored) return stored.arrayBuffer();
  return (await fetch(url)).arrayBuffer();
}

/**
 * 감독관 발소리 재생기
 *
 * 영상은 계속 음소거로 두고 소리를 따로 낸다. 소리 있는 영상은 브라우저가 자동 재생을 막아 영상까지 멈출 수 있고,
 * iOS는 영상 볼륨을 바꿀 수 없어 다가오던 소리를 줄이며 끄지 못해서다.
 * 알림음처럼 무음 keep-alive를 두지 않아 iOS 무음 스위치를 따른다.
 * 소리가 막혀도 감독관 영상은 그대로 돌아야 해서 어떤 예외도 밖으로 내보내지 않는다.
 */
export function createWatcherSound(
  createContext: () => AudioContext = defaultCreateContext,
  load: (url: string) => Promise<ArrayBuffer> = loadSound,
): WatcherSound {
  let context: AudioContext | null = null;
  const buffers = new Map<WatcherCue, Promise<AudioBuffer | null>>();
  const ready = new Map<WatcherCue, AudioBuffer>();
  // 준비를 기다리는 재생 요청. 멈추거나 새로 틀면 바뀌어 늦게 깨어난 옛 요청이 울리지 않는다.
  const pending = new Map<WatcherCue, object>();
  const voices = new Map<WatcherCue, { source: AudioBufferSourceNode; gain: GainNode }>();
  let muted = false;
  let volume = 1;

  const ensureRunning = (): AudioContext | null => {
    try {
      context ??= createContext();
      if (context.state !== "running") void context.resume().catch(() => undefined);
      return context;
    } catch {
      return null;
    }
  };

  const loadAll = (current: AudioContext) => {
    for (const cue of CUES) {
      if (buffers.has(cue)) continue;
      buffers.set(
        cue,
        load(`${WATCHER_ASSET_DIR}/sound/${cue}.m4a`)
          .then((data) => current.decodeAudioData(data))
          .then((buffer) => {
            ready.set(cue, buffer);
            return buffer;
          })
          .catch(() => null),
      );
    }
  };

  const stop = (cue: WatcherCue, afterSec = 0) => {
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

  const start = (current: AudioContext, cue: WatcherCue, buffer: AudioBuffer, at: number) => {
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
      const current = ensureRunning();
      if (current) loadAll(current);
    },
    play(cue, offsetSec = 0) {
      // 앱을 떠난 동안에도 영상이 다음 클립을 틀 수 있어 숨겨진 화면에서는 소리를 내지 않는다.
      if (muted || volume === 0 || document.hidden) return;
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
    setMuted(next) {
      muted = next;
      if (muted) for (const cue of CUES) stop(cue, MUTE_FADE_SEC);
    },
    setVolume(next) {
      volume = Math.min(1, Math.max(0, next));
      for (const voice of voices.values()) {
        try {
          voice.gain.gain.setValueAtTime(volume, context?.currentTime ?? 0);
        } catch {
          // 이미 끝난 소리는 무시한다.
        }
      }
    },
    stopAll() {
      for (const cue of CUES) stop(cue);
    },
    dispose() {
      for (const cue of CUES) stop(cue);
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

// 배경음 페이지의 `감독관 발소리` 음량(0~100). 설정 화면과 세션 화면이 다른 웹뷰라 localStorage에 둔다.
const VOLUME_KEY = "focusmakers.watcherSound.volume";

/** 처음이거나 읽지 못하면 100(맞춰 둔 크기 그대로)이다. */
export const DEFAULT_WATCHER_VOLUME = 100;

export function readWatcherVolume(): number {
  try {
    const stored = Number(localStorage.getItem(VOLUME_KEY) ?? Number.NaN);
    return Number.isFinite(stored) && stored >= 0 && stored <= 100
      ? stored
      : DEFAULT_WATCHER_VOLUME;
  } catch {
    return DEFAULT_WATCHER_VOLUME;
  }
}

export function writeWatcherVolume(level: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(level));
  } catch {
    // 저장하지 못하면 다음 세션은 기본 크기로 시작한다.
  }
}
