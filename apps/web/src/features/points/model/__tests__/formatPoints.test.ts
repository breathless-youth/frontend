import { describe, expect, it } from "vitest";

import { formatPoints, formatSignedPoints } from "../formatPoints";

describe("formatPoints", () => {
  it("숫자에 쉼표를 넣고 P를 붙인다", () => {
    expect(formatPoints(1240)).toBe("1,240P");
    expect(formatPoints(0)).toBe("0P");
  });
});

describe("formatSignedPoints", () => {
  it("받은 포인트에는 +, 쓴 포인트에는 -를 붙인다", () => {
    expect(formatSignedPoints(10)).toBe("+10P");
    expect(formatSignedPoints(1300)).toBe("+1,300P");
    expect(formatSignedPoints(-600)).toBe("-600P");
  });
});
