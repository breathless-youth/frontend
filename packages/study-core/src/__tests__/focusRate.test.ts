import { describe, expect, it } from "vitest";

import { computeFocusRate } from "../focusRate";

describe("computeFocusRate", () => {
  it("총 공부시간이 0이면 집중률은 0", () => {
    expect(computeFocusRate(0, 0)).toBe(0);
    expect(computeFocusRate(100, 0)).toBe(0);
  });

  it("순공시간이 총 공부시간을 초과해도 집중률은 1을 넘지 않음", () => {
    expect(computeFocusRate(150, 100)).toBe(1);
  });

  it("정상 범위에서 비율을 반환", () => {
    expect(computeFocusRate(50, 100)).toBe(0.5);
  });

  it("음수/비유한 입력은 안전한 값으로 정규화", () => {
    expect(computeFocusRate(-10, 100)).toBe(0);
    expect(computeFocusRate(50, -100)).toBe(0);
    expect(computeFocusRate(Number.NaN, 100)).toBe(0);
    expect(computeFocusRate(50, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
