import { describe, expect, it } from "vitest";

import { createNoiseSamples } from "../noiseSynth";

const KINDS = ["white", "pink", "brown"] as const;
const LENGTH = 44100;

/** 인접 샘플 상관계수. 화이트는 0 근처, 핑크·브라운으로 갈수록 1에 가까워진다. */
function lag1Correlation(samples: Float32Array): number {
  let mean = 0;
  for (const v of samples) mean += v;
  mean /= samples.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const d = samples[i] - mean;
    den += d * d;
    if (i > 0) num += d * (samples[i - 1] - mean);
  }
  return den === 0 ? 0 : num / den;
}

describe("createNoiseSamples", () => {
  it("요청한 길이의 Float32Array 를 돌려준다", () => {
    for (const kind of KINDS) {
      const out = createNoiseSamples(kind, 1000, 1);
      expect(out).toBeInstanceOf(Float32Array);
      expect(out).toHaveLength(1000);
    }
  });

  it("최대 절댓값이 1 이하이고 무음이 아니다", () => {
    for (const kind of KINDS) {
      const out = createNoiseSamples(kind, LENGTH, 7);
      let max = 0;
      for (const v of out) max = Math.max(max, Math.abs(v));
      expect(max).toBeLessThanOrEqual(1);
      expect(max).toBeGreaterThan(0);
    }
  });

  /**
   * 세 소리의 들리는 크기가 맞는지 지킨다. 피크만 맞추면 화이트가 브라운보다 13dB
   * 크게 들리고 트루 피크도 0을 넘는다. 아래 실효값은 셋 다 -18 LUFS가 되도록 맞춘
   * 보정 계수에서 나온 것이라, 필터나 난수 생성을 바꾸면 여기서 먼저 깨진다.
   * 깨지면 코드를 되돌리지 말고 라우드니스를 다시 재서 보정 계수와 이 표를 갱신한다.
   */
  it("종류별 실효값이 -18 LUFS 보정값에 맞는다", () => {
    // 보정을 잰 것과 같은 4초 버퍼를 쓴다. 브라운은 무작위 걸음이라 길이가 짧으면
    // 실효값이 눈에 띄게 낮게 나와 같은 기준으로 비교할 수 없다.
    const expected = { white: 0.0898, pink: 0.1324, brown: 0.1529 } as const;
    for (const kind of KINDS) {
      const out = createNoiseSamples(kind, 44100 * 4, 1);
      let sum = 0;
      let peak = 0;
      for (const v of out) {
        sum += v * v;
        peak = Math.max(peak, Math.abs(v));
      }
      const rms = Math.sqrt(sum / out.length);
      expect(rms, `${kind} 실효값`).toBeCloseTo(expected[kind], 2);
      // 셋을 최대 레벨로 겹쳐도 합이 1을 넘지 않을 만큼의 여유가 각 소리에 남아 있어야 한다.
      expect(peak, `${kind} 피크`).toBeLessThan(0.7);
    }
  });

  it("같은 시드에 같은 출력, 다른 시드에 다른 출력이다", () => {
    for (const kind of KINDS) {
      expect(createNoiseSamples(kind, 512, 42)).toEqual(createNoiseSamples(kind, 512, 42));
      expect(createNoiseSamples(kind, 512, 42)).not.toEqual(createNoiseSamples(kind, 512, 43));
    }
  });

  it("길이 0 이면 빈 배열이다", () => {
    expect(createNoiseSamples("brown", 0, 1)).toHaveLength(0);
  });

  it("인접 상관계수가 화이트 < 핑크 < 브라운 이다", () => {
    const white = lag1Correlation(createNoiseSamples("white", LENGTH, 3));
    const pink = lag1Correlation(createNoiseSamples("pink", LENGTH, 3));
    const brown = lag1Correlation(createNoiseSamples("brown", LENGTH, 3));
    expect(Math.abs(white)).toBeLessThan(0.05);
    expect(pink).toBeGreaterThan(white + 0.3);
    expect(brown).toBeGreaterThan(pink);
    expect(brown).toBeGreaterThan(0.9);
  });
});
