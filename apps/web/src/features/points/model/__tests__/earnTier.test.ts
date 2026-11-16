import { describe, expect, it } from "vitest";

import { tierAt } from "../earnTier";

const HOUR = 3600;
// 백엔드가 알려 준 지금 값과 같은 모양이며 숫자는 서버 설정이라 바뀔 수 있다.
const STUDY = [
  { fromSec: 2 * HOUR, toSec: 6 * HOUR, soloPoints: 4, togetherPoints: 5 },
  { fromSec: 0, toSec: 2 * HOUR, soloPoints: 7, togetherPoints: 10 },
  { fromSec: 6 * HOUR, toSec: 12 * HOUR, soloPoints: 1, togetherPoints: 2 },
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
    expect(tierAt(STUDY, 12 * HOUR)?.soloPoints).toBe(1);
    expect(tierAt(STUDY, 20 * HOUR)?.soloPoints).toBe(1);
    expect(tierAt([{ fromSec: 600, toSec: 1200, points: 3 }], 0)?.points).toBe(3);
  });

  it("구간이 없으면 null이다", () => {
    expect(tierAt([], 3600)).toBeNull();
  });
});
