import { describe, expect, it } from "vitest";

import { formatHoursMinutes, formatMinutes, splitHoursMinutes, todayLabel } from "../homeFormat";

describe("splitHoursMinutes", () => {
  it("초를 시·분으로 나눈다", () => {
    expect(splitHoursMinutes(3 * 3600 + 42 * 60)).toEqual({ hours: 3, minutes: 42 });
  });

  it("1시간 미만이면 hours가 0이다", () => {
    expect(splitHoursMinutes(42 * 60)).toEqual({ hours: 0, minutes: 42 });
  });
});

describe("formatHoursMinutes", () => {
  it("'N시간 M분' 형식으로 표시한다", () => {
    expect(formatHoursMinutes(5 * 3600 + 12 * 60)).toBe("5시간 12분");
  });
});

describe("formatMinutes", () => {
  it("'N분' 형식으로 표시하고 반올림한다", () => {
    expect(formatMinutes(52 * 60)).toBe("52분");
    expect(formatMinutes(90)).toBe("2분");
  });
});

describe("todayLabel", () => {
  it("'N월 N일 요일요일' 형식으로 표시한다", () => {
    expect(todayLabel(new Date(2026, 6, 26))).toBe("7월 26일 일요일");
  });
});
