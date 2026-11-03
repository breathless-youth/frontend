import { createSilentKeepAlive } from "@/features/ambient-sound/silentKeepAlive";

/**
 * 공부방 상대 소리 재생기
 *
 * 사람마다 MediaStreamSource, AnalyserNode, GainNode를 이어 스피커로 내보낸다.
 * 음량은 미디어 요소의 volume이 아니라 GainNode로 바꾸는데, iOS WebKit에서는 volume이 바뀌지 않는다.
 * Chromium은 원격 WebRTC 트랙을 미디어 요소에 붙여야 Web Audio로 샘플이 흘러서 같은 트랙을 음소거한 보조 audio 요소에도 붙인다.
 * Apple WebKit은 Web Audio만 쓰는 페이지를 무음 스위치에 따르게 해서 배경음과 같은 무음 keep-alive 요소를 함께 재생한다.
 * keep-alive는 소리를 내는 미디어 요소라 iOS가 사용자의 음악 앱을 멈출 수 있어서, 대부분 조용한 공부방에서는 마이크를 켠 멤버의 소리가 붙어 있을 때만 재생한다.
 * 통화나 알람이 컨텍스트를 멈추면 들을 상대가 있는 동안 다시 깨우고, 시스템이 멈춘 요소는 요소의 멈춤 상태를 보고 다시 건다.
 * 소리는 재생하고 크기만 읽으며 녹음하거나 저장하지 않는다.
 */
export interface RemoteAudioPlayer {
  attach(userId: number, track: MediaStreamTrack): void;
  detach(userId: number): void;
  setVolume(userId: number, volume: number): void;
  setMuted(userId: number, muted: boolean): void;
  setAllMuted(muted: boolean): void;
  /** 서버가 알려 준 마이크를 켠 멤버이고, 이 중 소리가 붙은 사람이 있을 때만 keep-alive를 재생한다. */
  setMicOnUsers(userIds: ReadonlySet<number>): void;
  /** 음량과 소리 끄기를 적용하기 전의 소리 크기라 내가 소리를 꺼도 말하는 중은 보인다. */
  level(userId: number): number;
  setLocalMeter(track: MediaStreamTrack | null): void;
  localLevel(): number;
  /**
   * 사용자 동작으로 다시 걸어야 할 재생이 있으면 true다.
   * 컨텍스트를 아직 만들지 않았거나 돌고 있지 않을 때, 재생해야 할 요소가 멈춰 있을 때다.
   */
  needsResume(): boolean;
  /** 사용자 동작 안에서 부르면 멈춘 요소를 다시 걸고 컨텍스트를 깨운다. */
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
 * 자동재생 거부는 소리를 막을 뿐 화면을 깨뜨리지 않아서 삼킨다.
 * 거부된 요소는 멈춘 채로 남아 다음 resume이 다시 건다.
 */
function playElement(element: HTMLAudioElement): void {
  try {
    const played: unknown = element.play();
    if (played instanceof Promise) {
      played.catch(() => undefined);
    }
  } catch {
    // play가 없거나 바로 실패한 환경이고, 위와 같은 이유로 넘어간다.
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
  let micOnUsers: ReadonlySet<number> = new Set();
  let localMeter: LocalMeter | null = null;
  // undefined는 아직 만들지 않은 것이고, null은 Apple WebKit이 아니라 만들지 않는다는 뜻이다.
  let keepAlive: HTMLAudioElement | null | undefined;

  function context(): AudioContext | null {
    if (ctx === undefined) {
      let created: AudioContext | null;
      try {
        created = audioContextFactory();
      } catch {
        created = null;
      }
      ctx = created;
      // 통화나 알람처럼 부르지 않았는데 멈추면 들을 상대가 있는 동안 다시 깨운다.
      // 앱 웹뷰는 사용자 동작 없이도 재생을 허용해서 여기서 되살아나고, 브라우저는 다음 누름이 다시 부른다.
      created?.addEventListener("statechange", () => {
        if (ctx === created && created.state !== "running" && voices.size > 0) {
          void resume();
        }
      });
    }
    return ctx;
  }

  function applyGain(userId: number): void {
    const voice = voices.get(userId);
    if (voice !== undefined) {
      voice.gain.gain.value = allMuted || muted.has(userId) ? 0 : (volumes.get(userId) ?? 1);
    }
  }

  function keepAliveWanted(): boolean {
    for (const userId of voices.keys()) {
      if (micOnUsers.has(userId)) {
        return true;
      }
    }
    return false;
  }

  // 통화나 잠금 화면으로 시스템이 요소를 멈추면 따로 둔 표시로는 알 수 없어서 요소의 paused를 본다.
  function startKeepAlive(): void {
    if (keepAlive === undefined) {
      try {
        keepAlive = keepAliveFactory();
      } catch {
        keepAlive = null;
      }
    }
    if (keepAlive !== null && keepAlive.paused !== false) {
      playElement(keepAlive);
    }
  }

  function stopKeepAlive(): void {
    if (keepAlive && keepAlive.paused === false) {
      keepAlive.pause();
    }
  }

  function syncKeepAlive(): void {
    if (keepAliveWanted()) {
      startKeepAlive();
    } else {
      stopKeepAlive();
    }
  }

  async function resume(): Promise<void> {
    const audioContext = context();
    if (audioContext === null) {
      return;
    }
    // 사용자 동작 밖에서 거부되거나 시스템이 멈춘 재생은 다시 걸어야 풀린다.
    for (const voice of voices.values()) {
      if (voice.assist.paused !== false) {
        playElement(voice.assist);
      }
    }
    if (keepAliveWanted()) {
      startKeepAlive();
    }
    if (audioContext.state === "running") {
      return;
    }
    try {
      await audioContext.resume();
    } catch {
      // 사용자 동작 밖이라 거부되면 멈춘 채로 남고, 호출한 쪽이 다음 사용자 동작에서 다시 부른다.
    }
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
      syncKeepAlive();
    },
    detach(userId) {
      removeVoice(userId);
      syncKeepAlive();
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
    setMicOnUsers(userIds) {
      micOnUsers = new Set(userIds);
      syncKeepAlive();
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
    needsResume() {
      if (ctx === null) {
        return false;
      }
      if (ctx === undefined || ctx.state !== "running") {
        return true;
      }
      for (const voice of voices.values()) {
        if (voice.assist.paused !== false) {
          return true;
        }
      }
      return keepAliveWanted() && keepAlive != null && keepAlive.paused !== false;
    },
    resume,
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
      micOnUsers = new Set();
      const closing = ctx;
      ctx = undefined;
      if (closing) {
        void closing.close().catch(() => undefined);
      }
    },
  };
}
