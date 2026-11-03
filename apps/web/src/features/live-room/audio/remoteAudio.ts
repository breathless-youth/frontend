import { createSilentKeepAlive } from "@/features/ambient-sound/silentKeepAlive";

/**
 * 공부방 상대 소리 재생기
 *
 * 사람마다 MediaStreamSource, AnalyserNode, GainNode를 이어 스피커로 내보낸다.
 * 음량은 미디어 요소의 volume이 아니라 GainNode로 바꾸는데, iOS WebKit에서는 volume이 바뀌지 않는다.
 * Chromium은 원격 WebRTC 트랙을 미디어 요소에 붙여야 Web Audio로 샘플이 흘러서 같은 트랙을 음소거한 보조 audio 요소에도 붙인다.
 * Apple WebKit은 Web Audio만 쓰는 페이지를 무음 스위치에 따르게 해서 상대 소리가 있는 동안 배경음과 같은 무음 keep-alive 요소를 재생한다.
 * 소리는 재생하고 크기만 읽으며 녹음하거나 저장하지 않는다.
 */
export interface RemoteAudioPlayer {
  attach(userId: number, track: MediaStreamTrack): void;
  detach(userId: number): void;
  setVolume(userId: number, volume: number): void;
  setMuted(userId: number, muted: boolean): void;
  setAllMuted(muted: boolean): void;
  /** 음량과 소리 끄기를 적용하기 전의 소리 크기라 내가 소리를 꺼도 말하는 중은 보인다. */
  level(userId: number): number;
  setLocalMeter(track: MediaStreamTrack | null): void;
  localLevel(): number;
  /** 사용자 동작 안에서 불러야 WKWebView와 브라우저가 소리를 내보낸다. */
  resume(): Promise<void>;
  /** 닫은 뒤에 다시 붙이면 새 컨텍스트로 시작해서 StrictMode의 다시 마운트에도 쓸 수 있다. */
  close(): void;
}

interface Voice {
  source: AudioNode;
  analyser: AnalyserNode;
  gain: GainNode;
  assist: HTMLAudioElement;
  samples: Float32Array<ArrayBuffer>;
}

interface LocalMeter {
  track: MediaStreamTrack;
  source: AudioNode;
  analyser: AnalyserNode;
  samples: Float32Array<ArrayBuffer>;
}

// 100ms마다 읽는 말하는 중 판정에는 짧은 창으로 충분하다.
const ANALYSER_FFT_SIZE = 512;

function defaultAudioContextFactory(): AudioContext | null {
  const Ctor =
    globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

function defaultAssistElement(): HTMLAudioElement {
  return document.createElement("audio");
}

// 슬라이더 밖 값이 와도 AudioParam이 거부하지 않게 0~1로 자른다.
function clampVolume(volume: number): number {
  return Number.isNaN(volume) ? 0 : Math.min(1, Math.max(0, volume));
}

function rms(analyser: AnalyserNode, samples: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return samples.length === 0 ? 0 : Math.min(1, Math.sqrt(sum / samples.length));
}

/**
 * 재생 시작
 *
 * 자동재생 거부는 소리를 막을 뿐 화면을 깨뜨리지 않아서 삼키고, 거부되면 알려 다음 사용자 동작에서 다시 시도하게 한다.
 */
function playElement(element: HTMLAudioElement, onRejected?: () => void): void {
  try {
    const played: unknown = element.play();
    if (played instanceof Promise) {
      played.catch(() => onRejected?.());
    }
  } catch {
    onRejected?.();
  }
}

export function createRemoteAudioPlayer(
  deps: {
    audioContextFactory?: () => AudioContext | null;
    createAssistElement?: () => HTMLAudioElement;
    keepAliveFactory?: () => HTMLAudioElement | null;
  } = {},
): RemoteAudioPlayer {
  const {
    audioContextFactory = defaultAudioContextFactory,
    createAssistElement = defaultAssistElement,
    keepAliveFactory = () => createSilentKeepAlive(),
  } = deps;

  // undefined는 아직 만들지 않은 것이고, null은 이 브라우저에서 만들 수 없다는 뜻이다.
  let ctx: AudioContext | null | undefined;
  const voices = new Map<number, Voice>();
  // 연결을 다시 맺으며 소리를 다시 붙여도 사람별 음량과 소리 끄기가 남게 소리와 따로 들고 있다.
  const volumes = new Map<number, number>();
  const muted = new Set<number>();
  let allMuted = false;
  let localMeter: LocalMeter | null = null;
  let keepAlive: HTMLAudioElement | null | undefined;
  let keepAlivePlaying = false;

  function context(): AudioContext | null {
    if (ctx === undefined) {
      try {
        ctx = audioContextFactory();
      } catch {
        ctx = null;
      }
    }
    return ctx;
  }

  function applyGain(userId: number): void {
    const voice = voices.get(userId);
    if (voice !== undefined) {
      voice.gain.gain.value = allMuted || muted.has(userId) ? 0 : (volumes.get(userId) ?? 1);
    }
  }

  function startKeepAlive(): void {
    if (keepAlivePlaying) {
      return;
    }
    if (keepAlive === undefined) {
      try {
        keepAlive = keepAliveFactory();
      } catch {
        keepAlive = null;
      }
    }
    if (keepAlive === null) {
      return;
    }
    keepAlivePlaying = true;
    playElement(keepAlive, () => {
      keepAlivePlaying = false;
    });
  }

  function stopKeepAlive(): void {
    if (!keepAlivePlaying) {
      return;
    }
    keepAlivePlaying = false;
    keepAlive?.pause();
  }

  function removeVoice(userId: number): void {
    const voice = voices.get(userId);
    if (voice === undefined) {
      return;
    }
    voices.delete(userId);
    voice.source.disconnect();
    voice.analyser.disconnect();
    voice.gain.disconnect();
    voice.assist.pause();
    voice.assist.srcObject = null;
  }

  function removeLocalMeter(): void {
    if (localMeter === null) {
      return;
    }
    localMeter.source.disconnect();
    localMeter = null;
  }

  return {
    attach(userId, track) {
      const audioContext = context();
      if (audioContext === null) {
        return;
      }
      // 연결을 새로 맺어 트랙이 바뀌면 앞 트랙의 노드부터 끊는다.
      removeVoice(userId);
      const stream = new MediaStream([track]);
      const assist = createAssistElement();
      assist.muted = true;
      assist.srcObject = stream;
      playElement(assist);
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = ANALYSER_FFT_SIZE;
      const gain = audioContext.createGain();
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(audioContext.destination);
      voices.set(userId, {
        source,
        analyser,
        gain,
        assist,
        samples: new Float32Array(analyser.fftSize),
      });
      applyGain(userId);
      startKeepAlive();
    },
    detach(userId) {
      removeVoice(userId);
      if (voices.size === 0) {
        stopKeepAlive();
      }
    },
    setVolume(userId, volume) {
      volumes.set(userId, clampVolume(volume));
      applyGain(userId);
    },
    setMuted(userId, next) {
      if (next) {
        muted.add(userId);
      } else {
        muted.delete(userId);
      }
      applyGain(userId);
    },
    setAllMuted(next) {
      allMuted = next;
      for (const userId of voices.keys()) {
        applyGain(userId);
      }
    },
    level(userId) {
      const voice = voices.get(userId);
      return voice === undefined ? 0 : rms(voice.analyser, voice.samples);
    },
    setLocalMeter(track) {
      if (localMeter?.track === track) {
        return;
      }
      removeLocalMeter();
      const audioContext = track === null ? null : context();
      if (track === null || audioContext === null) {
        return;
      }
      const source = audioContext.createMediaStreamSource(new MediaStream([track]));
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = ANALYSER_FFT_SIZE;
      // 내 목소리가 내 스피커로 다시 나오지 않게 크기만 읽고 destination에는 잇지 않는다.
      source.connect(analyser);
      localMeter = { track, source, analyser, samples: new Float32Array(analyser.fftSize) };
    },
    localLevel() {
      return localMeter === null ? 0 : rms(localMeter.analyser, localMeter.samples);
    },
    async resume() {
      const audioContext = context();
      if (audioContext === null) {
        return;
      }
      // 사용자 동작 밖에서 거부된 재생은 이 동작 안에서 다시 걸어야 풀린다.
      for (const voice of voices.values()) {
        if (voice.assist.paused) {
          playElement(voice.assist);
        }
      }
      if (voices.size > 0) {
        startKeepAlive();
      }
      if (audioContext.state === "running") {
        return;
      }
      try {
        await audioContext.resume();
      } catch {
        // 사용자 동작 밖이라 거부되면 다음 누름이나 마이크 버튼이 다시 부른다.
      }
    },
    close() {
      for (const userId of [...voices.keys()]) {
        removeVoice(userId);
      }
      removeLocalMeter();
      stopKeepAlive();
      keepAlive = undefined;
      volumes.clear();
      muted.clear();
      allMuted = false;
      const closing = ctx;
      ctx = undefined;
      if (closing) {
        void closing.close().catch(() => undefined);
      }
    },
  };
}
