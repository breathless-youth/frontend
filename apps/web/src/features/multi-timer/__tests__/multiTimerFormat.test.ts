import { describe, expect, it } from "vitest";

import { formatPomodoroRemaining, joinTimerSec, splitTimerSec } from "../multiTimerFormat";

describe("formatPomodoroRemaining", () => {
  it("1시간 이상은 h:mm:ss, 미만은 mm:ss", () => {
    expect(formatPomodoroRemaining(5_400_000)).toBe("1:30:00");
    expect(formatPomodoroRemaining(1_500_000)).toBe("25:00");
    expect(formatPomodoroRemaining(3_600_000)).toBe("1:00:00");
    expect(formatPomodoroRemaining(3_599_000)).toBe("59:59");
    expect(formatPomodoroRemaining(825_000)).toBe("13:45");
  });
});

describe("splitTimerSec / joinTimerSec", () => {
  it("시분초로 나누고 합친다", () => {
    expect(splitTimerSec(4323)).toEqual({ h: 1, m: 12, s: 3 });
    expect(joinTimerSec(splitTimerSec(4323))).toBe(4323);
    expect(joinTimerSec({ h: 23, m: 59, s: 59 })).toBe(86399);
  });
});
