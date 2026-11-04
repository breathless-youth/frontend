/**
 * 말하는 중 판정
 *
 * 켜는 기준과 끄는 기준을 나눠서 말끝이 잦아드는 사이 표시가 깜빡이지 않게 한다.
 * 수치는 실기기에서 다시 맞출 수 있게 상수로 둔다.
 */
export const SPEAKING_ON_LEVEL = 0.03;
export const SPEAKING_OFF_LEVEL = 0.015;
export const SPEAKING_ON_SAMPLES = 2;
export const SPEAKING_OFF_SAMPLES = 5;
export const SPEAKING_SAMPLE_MS = 100;

export interface SpeakingState {
  speaking: boolean;
  /** 켜는 기준 이상이 연달아 나온 횟수 */
  above: number;
  /** 끄는 기준 아래가 연달아 나온 횟수 */
  below: number;
}

export const INITIAL_SPEAKING: SpeakingState = { speaking: false, above: 0, below: 0 };

export function nextSpeaking(state: SpeakingState, level: number): SpeakingState {
  if (level >= SPEAKING_ON_LEVEL) {
    const above = state.above + 1;
    return { speaking: state.speaking || above >= SPEAKING_ON_SAMPLES, above, below: 0 };
  }
  if (level < SPEAKING_OFF_LEVEL) {
    const below = state.below + 1;
    return { speaking: state.speaking && below < SPEAKING_OFF_SAMPLES, above: 0, below };
  }
  // 두 기준 사이 값은 어느 쪽 연속도 끊는다.
  return { speaking: state.speaking, above: 0, below: 0 };
}
