import { describe, expect, it } from "vitest";

import { formatElapsed, toKoreanDuration } from "../formatDuration";

describe("formatElapsed", () => {
  it("시(hour)에도 zero-pad해서 항상 HH:MM:SS로 만든다", () => {
    // 2026-07-26 확정 표기 — 예전 `1:24:08`(시 미패딩)은 규칙 위반이었다.
    expect(formatElapsed(5048)).toBe("01:24:08");
    expect(formatElapsed(0)).toBe("00:00:00");
    expect(formatElapsed(59)).toBe("00:00:59");
    expect(formatElapsed(600)).toBe("00:10:00");
  });

  it("1시간 미만도 MM:SS로 줄이지 않는다", () => {
    expect(formatElapsed(90)).toBe("00:01:30");
  });

  it("10시간 이상은 자리수를 유지한다", () => {
    expect(formatElapsed(36000)).toBe("10:00:00");
    expect(formatElapsed(359999)).toBe("99:59:59");
  });

  it("음수·소수는 안전하게 내림 처리한다", () => {
    expect(formatElapsed(-5)).toBe("00:00:00");
    expect(formatElapsed(61.9)).toBe("00:01:01");
  });
});

describe("toKoreanDuration", () => {
  it("스크린리더용 한글 표현을 만든다", () => {
    expect(toKoreanDuration(5048)).toBe("1시간 24분 8초");
    expect(toKoreanDuration(3600)).toBe("1시간");
    expect(toKoreanDuration(0)).toBe("0초");
  });
});
