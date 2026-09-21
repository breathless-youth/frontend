import { describe, expect, it } from "vitest";

import { createBeatSamples, isBeatKind } from "../beatSynth";

const RATE = 44100;

/** 1초 구간의 0 교차 횟수. 사인파는 주파수의 두 배가 나온다. */
function zeroCrossings(samples: Float32Array, from: number, to: number): number {
  let count = 0;
  for (let i = from + 1; i < to; i += 1) {
    if (samples[i - 1] <= 0 && samples[i] > 0) count += 2;
  }
  return count;
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const v of samples) sum += v * v;
  return Math.sqrt(sum / samples.length);
}

describe("isBeatKind", () => {
  it("비트 두 종만 참이다", () => {
    expect(isBeatKind("binaural")).toBe(true);
    expect(isBeatKind("monaural")).toBe(true);
    expect(isBeatKind("white")).toBe(false);
    expect(isBeatKind("")).toBe(false);
  });
});

describe("createBeatSamples", () => {
  it("요청한 길이의 좌우 채널을 돌려준다", () => {
    const { left, right } = createBeatSamples("binaural", 1000, RATE);
    expect(left).toBeInstanceOf(Float32Array);
    expect(right).toBeInstanceOf(Float32Array);
    expect(left).toHaveLength(1000);
    expect(right).toHaveLength(1000);
  });

  it("바이노럴은 좌우 주파수가 10Hz 차이다", () => {
    const { left, right } = createBeatSamples("binaural", RATE, RATE);
    expect(zeroCrossings(left, 0, RATE)).toBe(390);
    expect(zeroCrossings(right, 0, RATE)).toBe(410);
  });

  it("모노럴은 좌우가 같은 값이다", () => {
    const { left, right } = createBeatSamples("monaural", 5000, RATE);
    expect(left).toEqual(right);
  });

  /**
   * 두 음이 더해진 신호라 진폭이 초당 10번 부풀었다 골에서 0 으로 잦아든다. 그 골이
   * 초당 몇 번인지가 비트 주파수다. 짧은 구간의 최대치가 0 근처로 떨어지는 무리를 세면
   * 골 개수가 나온다.
   */
  it("모노럴은 진폭이 초당 10번 골로 잦아든다", () => {
    const { left } = createBeatSamples("monaural", RATE, RATE);
    const step = Math.round(RATE / 400);
    let troughs = 0;
    let inTrough = false;
    for (let start = 0; start + step <= RATE; start += step) {
      let max = 0;
      for (let i = start; i < start + step; i += 1) max = Math.max(max, Math.abs(left[i]));
      if (max < 0.05) {
        if (!inTrough) troughs += 1;
        inTrough = true;
      } else {
        inTrough = false;
      }
    }
    expect(troughs).toBe(10);
  });

  /**
   * 노이즈 3종과 같은 -18 LUFS 기준에 맞춘 값이다. 진폭 상수를 바꾸면 여기서 먼저
   * 깨진다. 깨지면 코드를 되돌리지 말고 라우드니스를 다시 재서 둘을 함께 갱신한다.
   */
  it("좌우 실효값이 -18 LUFS 보정값에 맞는다", () => {
    const expected = { binaural: 0.1, monaural: 0.0989 } as const;
    for (const kind of ["binaural", "monaural"] as const) {
      const { left, right } = createBeatSamples(kind, RATE * 4, RATE);
      expect(rms(left), `${kind} 좌`).toBeCloseTo(expected[kind], 3);
      expect(rms(right), `${kind} 우`).toBeCloseTo(expected[kind], 3);
      let peak = 0;
      for (const v of left) peak = Math.max(peak, Math.abs(v));
      expect(peak, `${kind} 피크`).toBeLessThan(0.7);
    }
  });

  /**
   * 4초 버퍼 안에서 195Hz 는 780번, 205Hz 는 820번 진동해 둘 다 정수로 끝난다.
   * 그래서 버퍼 끝과 시작이 이어지고 반복 지점에 클릭음이 없다.
   */
  it("4초 버퍼는 끝과 시작이 이어진다", () => {
    const length = RATE * 4;
    const { left, right } = createBeatSamples("binaural", length, RATE);
    for (const [name, samples] of [
      ["좌", left],
      ["우", right],
    ] as const) {
      let maxStep = 0;
      for (let i = 1; i < samples.length; i += 1) {
        maxStep = Math.max(maxStep, Math.abs(samples[i] - samples[i - 1]));
      }
      const seam = Math.abs(samples[0] - samples[samples.length - 1]);
      expect(seam, `${name} 이음매`).toBeLessThanOrEqual(maxStep * 1.5);
    }
  });

  it("길이 0 이면 빈 배열이다", () => {
    const { left, right } = createBeatSamples("binaural", 0, RATE);
    expect(left).toHaveLength(0);
    expect(right).toHaveLength(0);
  });
});
