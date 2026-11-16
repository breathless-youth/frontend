import { describe, expect, it } from "vitest";

import { tierAt } from "../earnTier";

const HOUR = 3600;
// 지금 서버는 구간 하나만 보내지만 구간 고르기를 보려고 여러 구간을 뒤섞어 둔다.
const STUDY = [
  { fromSec: 2 * HOUR, toSec: 6 * HOUR, soloPoints: 4, togetherPoints: 5 },
  { fromSec: 0, toSec: 2 * HOUR, soloPoints: 7, togetherPoints: 10 },
  { fromSec: 6 * HOUR, toSec: 10 * HOUR, soloPoints: 1, togetherPoints: 2 },
];

describe("tierAt", () => {
  it("순서와 상관없이 시작 이상, 끝 미만인 구간을 고른다", () => {
    expect(tierAt(STUDY, 0)?.soloPoints).toBe(7);
    expect(tierAt(STUDY, 2 * HOUR - 1)?.soloPoints).toBe(7);
    expect(tierAt(STUDY, 2 * HOUR)?.soloPoints).toBe(4);
    expect(tierAt(STUDY, 7800)?.soloPoints).toBe(4);
    expect(tierAt(STUDY, 6 * HOUR)?.soloPoints).toBe(1);
  });

  it("상한에 닿았거나 넘었으면 마지막 구간, 첫 구간보다 앞이면 첫 구간이다", () => {
    expect(tierAt(STUDY, 10 * HOUR)?.soloPoints).toBe(1);
    expect(tierAt(STUDY, 20 * HOUR)?.soloPoints).toBe(1);
    expect(tierAt([{ fromSec: 600, toSec: 1200, points: 3 }], 0)?.points).toBe(3);
  });

  it("구간이 하나면 하루 상한 안팎 어디서나 그 구간이다", () => {
    const fixed = [{ fromSec: 0, toSec: 10 * HOUR, soloPoints: 7, togetherPoints: 10 }];
    for (const sec of [0, 5 * HOUR, 10 * HOUR, 11 * HOUR]) {
      expect(tierAt(fixed, sec)).toEqual(fixed[0]);
    }
  });

  it("구간이 없으면 null이다", () => {
    expect(tierAt([], 3600)).toBeNull();
  });
});
