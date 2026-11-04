import { describe, expect, it } from "vitest";

import { formatClock } from "../formatClock";

describe("formatClock", () => {
  it("H:MM:SS이고 시는 자르지 않는다", () => {
    expect(formatClock(47460)).toBe("13:11:00");
    expect(formatClock(148800)).toBe("41:20:00");
  });

  it("초 아래는 버리고 음수는 0으로 본다", () => {
    expect(formatClock(11060.9)).toBe("3:04:20");
    expect(formatClock(-5)).toBe("0:00:00");
  });
});
