import { describe, expect, it } from "vitest";

import type { SpeakingState } from "../speaking";
import {
  INITIAL_SPEAKING,
  nextSpeaking,
  SPEAKING_OFF_LEVEL,
  SPEAKING_OFF_SAMPLES,
  SPEAKING_ON_LEVEL,
  SPEAKING_ON_SAMPLES,
} from "../speaking";

// 기준값을 실기기에서 다시 맞춰도 테스트를 고치지 않게 소리 크기를 기준값에서 만든다.
const ABOVE = SPEAKING_ON_LEVEL;
const BELOW = SPEAKING_OFF_LEVEL / 2;
const BETWEEN = (SPEAKING_ON_LEVEL + SPEAKING_OFF_LEVEL) / 2;

function feed(state: SpeakingState, level: number, times: number): SpeakingState {
  let next = state;
  for (let i = 0; i < times; i += 1) {
    next = nextSpeaking(next, level);
  }
  return next;
}

describe("nextSpeaking", () => {
  it("처음에는 말하는 중이 아니다", () => {
    expect(INITIAL_SPEAKING.speaking).toBe(false);
  });

  it("끄는 기준이 켜는 기준보다 낮아 두 기준 사이에서는 표시가 바뀌지 않는다", () => {
    expect(SPEAKING_OFF_LEVEL).toBeLessThan(SPEAKING_ON_LEVEL);
    const speaking = feed(INITIAL_SPEAKING, ABOVE, SPEAKING_ON_SAMPLES);
    expect(feed(speaking, BETWEEN, SPEAKING_OFF_SAMPLES * 3).speaking).toBe(true);
    expect(feed(INITIAL_SPEAKING, BETWEEN, SPEAKING_ON_SAMPLES * 3).speaking).toBe(false);
  });

  it("켜는 기준 이상이 정해진 횟수만큼 연달아 나와야 말하는 중이다", () => {
    const almost = feed(INITIAL_SPEAKING, ABOVE, SPEAKING_ON_SAMPLES - 1);
    expect(almost.speaking).toBe(false);
    expect(nextSpeaking(almost, ABOVE).speaking).toBe(true);
  });

  it("켜는 기준을 넘다가 사이에 한 번 낮아지면 켜기를 처음부터 다시 센다", () => {
    const broken = nextSpeaking(feed(INITIAL_SPEAKING, ABOVE, SPEAKING_ON_SAMPLES - 1), BETWEEN);
    expect(feed(broken, ABOVE, SPEAKING_ON_SAMPLES - 1).speaking).toBe(false);
    expect(feed(broken, ABOVE, SPEAKING_ON_SAMPLES).speaking).toBe(true);
  });

  it("끄는 기준 아래가 정해진 횟수만큼 연달아 나와야 끄고 사이에 한 번 튀면 다시 센다", () => {
    let state = feed(INITIAL_SPEAKING, ABOVE, SPEAKING_ON_SAMPLES);
    state = feed(state, BELOW, SPEAKING_OFF_SAMPLES - 1);
    expect(state.speaking).toBe(true);
    state = nextSpeaking(state, BETWEEN);
    state = feed(state, BELOW, SPEAKING_OFF_SAMPLES - 1);
    expect(state.speaking).toBe(true);
    expect(nextSpeaking(state, BELOW).speaking).toBe(false);
  });
});
