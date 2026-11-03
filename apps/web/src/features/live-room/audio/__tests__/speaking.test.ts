import { describe, expect, it } from "vitest";

import {
  INITIAL_SPEAKING,
  nextSpeaking,
  SPEAKING_OFF_LEVEL,
  SPEAKING_OFF_SAMPLES,
  SPEAKING_ON_LEVEL,
  SPEAKING_ON_SAMPLES,
  SPEAKING_SAMPLE_MS,
} from "../speaking";

describe("nextSpeaking", () => {
  it("켜는 기준과 끄는 기준을 따로 둔다", () => {
    expect({
      on: SPEAKING_ON_LEVEL,
      off: SPEAKING_OFF_LEVEL,
      onSamples: SPEAKING_ON_SAMPLES,
      offSamples: SPEAKING_OFF_SAMPLES,
      sampleMs: SPEAKING_SAMPLE_MS,
    }).toEqual({ on: 0.03, off: 0.015, onSamples: 2, offSamples: 5, sampleMs: 100 });
    expect(INITIAL_SPEAKING.speaking).toBe(false);
  });

  it("두 번 연달아 기준을 넘으면 말하는 중이다", () => {
    const once = nextSpeaking(INITIAL_SPEAKING, 0.05);
    expect(once.speaking).toBe(false);
    expect(nextSpeaking(once, 0.05).speaking).toBe(true);
  });

  it("기준을 넘다가 사이에 한 번 낮아지면 켜기를 처음부터 다시 센다", () => {
    const state = nextSpeaking(nextSpeaking(INITIAL_SPEAKING, 0.05), 0.02);
    expect(nextSpeaking(state, 0.05).speaking).toBe(false);
  });

  it("다섯 번 연달아 아래여야 끄고 사이에 한 번 튀면 다시 센다", () => {
    let state = nextSpeaking(nextSpeaking(INITIAL_SPEAKING, 0.05), 0.05);
    for (const level of [0.01, 0.01, 0.01, 0.01]) state = nextSpeaking(state, level);
    expect(state.speaking).toBe(true);
    state = nextSpeaking(state, 0.02);
    for (const level of [0.01, 0.01, 0.01, 0.01]) state = nextSpeaking(state, level);
    expect(state.speaking).toBe(true);
    expect(nextSpeaking(state, 0.01).speaking).toBe(false);
  });
});
