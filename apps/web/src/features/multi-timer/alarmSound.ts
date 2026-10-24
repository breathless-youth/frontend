/**
 * 모드 단계가 끝날 때 내는 짧은 합성 알림음
 *
 * 파일을 받지 않으려고 사인파 두 음을 Web Audio로 그 자리에서 만든다.
 * 배경음 플레이어의 컨텍스트를 빌려 쓰지 않는 이유는 그쪽이 배경음을 끄거나 세션이 멈추면 멈추고 닫히기 때문이다.
 * 배경음이 쓰는 무음 keep-alive 요소를 두지 않아 iOS 무음 스위치를 그대로 따른다.
 * 무음일 때 소리를 막는 것은 OS에 맡기기로 했다.
 */

export interface AlarmSound {
  /** 사용자 누름 안에서 불러야 iOS가 이후의 재생을 허락한다. */
  prime(): void;
  play(): void;
  dispose(): void;
}

const TONES = [
  { frequency: 880, durationSec: 0.16 },
  { frequency: 1320, durationSec: 0.22 },
] as const;
const PEAK_GAIN = 0.25;
const ATTACK_SEC = 0.01;

function defaultCreateContext(): AudioContext {
  const Ctor =
    globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error("AudioContext unsupported");
  return new Ctor();
}

function scheduleTone(
  context: AudioContext,
  frequency: number,
  startSec: number,
  durationSec: number,
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startSec);
  // 0에서 올렸다가 0으로 내려야 음의 처음과 끝에 딸깍 소리가 나지 않는다.
  gain.gain.setValueAtTime(0, startSec);
  gain.gain.linearRampToValueAtTime(PEAK_GAIN, startSec + ATTACK_SEC);
  gain.gain.linearRampToValueAtTime(0, startSec + durationSec);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(startSec);
  oscillator.stop(startSec + durationSec);
}

/**
 * 알림음 생성
 *
 * 웹뷰에서 오디오가 막혀도 함께 나는 햅틱은 살아야 해서 어떤 예외도 밖으로 내보내지 않는다.
 * 컨텍스트를 만들지 못하면 다음 호출에서 다시 시도한다.
 */
export function createAlarmSound(
  createContext: () => AudioContext = defaultCreateContext,
): AlarmSound {
  let context: AudioContext | null = null;

  const ensureRunning = (): AudioContext | null => {
    try {
      context ??= createContext();
      // iOS는 전화·알람 뒤 interrupted 로 남아 suspended 와 같이 깨워야 한다.
      if (context.state !== "running") {
        void context.resume().catch(() => undefined);
      }
      return context;
    } catch {
      return null;
    }
  };

  return {
    prime() {
      ensureRunning();
    },
    play() {
      const current = ensureRunning();
      // 멈춘 컨텍스트에 예약한 음은 나중에 깨어날 때 뒤늦게 울려 끝난 시각과 어긋난다.
      if (current === null || current.state !== "running") return;
      try {
        let at = current.currentTime;
        for (const tone of TONES) {
          scheduleTone(current, tone.frequency, at, tone.durationSec);
          at += tone.durationSec;
        }
      } catch {
        // 소리를 못 내도 알림의 나머지(햅틱)는 호출부에서 이어진다.
      }
    },
    dispose() {
      const current = context;
      context = null;
      try {
        void current?.close().catch(() => undefined);
      } catch {
        // 이미 닫힌 컨텍스트를 다시 닫는 예외는 정리 단계라 무시한다.
      }
    },
  };
}
