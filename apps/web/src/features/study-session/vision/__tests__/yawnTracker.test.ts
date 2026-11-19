import { describe, expect, it } from "vitest";

import type { Yawn } from "../yawnTracker";
import { EMPTY_YAWN_STATE, stepYawn } from "../yawnTracker";

/** [시각(ms), 입 벌림] 표본을 차례로 넣고 끝난 하품을 모은다. */
function feed(samples: readonly (readonly [number, number | null])[]): Yawn[] {
  let state = EMPTY_YAWN_STATE;
  const yawns: Yawn[] = [];
  for (const [t, jaw] of samples) {
    const step = stepYawn(state, jaw, t);
    state = step.state;
    if (step.yawn !== null) {
      yawns.push(step.yawn);
    }
  }
  return yawns;
}

describe("하품 판정", () => {
  it("0.15 이상에서 시작하고 2초 동안 0.15 미만이면 끝난다", () => {
    const yawns = feed([
      [0, 0.05],
      [500, 0.2],
      [1000, 0.45],
      [1500, 0.3],
      [2000, 0.1],
      [3000, 0.1],
      [4000, 0.1],
    ]);

    expect(yawns).toEqual([{ startedAtMs: 500, endedAtMs: 1500, peak: 0.45 }]);
  });

  it("2초가 차기 전에 다시 0.15를 넘으면 같은 하품이다", () => {
    const yawns = feed([
      [0, 0.4],
      [1500, 0.05],
      [1900, 0.2],
      [2500, 0.05],
      [4500, 0.05],
    ]);

    expect(yawns).toEqual([{ startedAtMs: 0, endedAtMs: 1900, peak: 0.4 }]);
  });

  it("최고값이 0.3에 못 미치면 하품이 아니다", () => {
    expect(
      feed([
        [0, 0.29],
        [2000, 0.05],
      ]),
    ).toEqual([]);
  });

  it("최고값 0.3은 하품이다", () => {
    expect(
      feed([
        [0, 0.3],
        [2000, 0.05],
      ]),
    ).toHaveLength(1);
  });

  it("높은 표본 하나만 잡히면 끝과 시작이 같은 하품이다", () => {
    expect(
      feed([
        [1000, 0.5],
        [1500, 0.05],
        [3000, 0.05],
      ]),
    ).toEqual([{ startedAtMs: 1000, endedAtMs: 1000, peak: 0.5 }]);
  });

  it("얼굴이 안 보인 표본은 입을 다문 것으로 본다", () => {
    expect(
      feed([
        [0, 0.5],
        [1000, null],
        [2000, null],
      ]),
    ).toEqual([{ startedAtMs: 0, endedAtMs: 0, peak: 0.5 }]);
  });

  it("하품이 끝나면 다음 하품을 따로 센다", () => {
    expect(
      feed([
        [0, 0.4],
        [2000, 0.05],
        [5000, 0.35],
        [7000, 0.05],
      ]),
    ).toEqual([
      { startedAtMs: 0, endedAtMs: 0, peak: 0.4 },
      { startedAtMs: 5000, endedAtMs: 5000, peak: 0.35 },
    ]);
  });
});
