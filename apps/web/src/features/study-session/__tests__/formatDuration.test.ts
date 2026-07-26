import { describe, expect, it } from "vitest";

import {
  formatElapsed,
  toKoreanDuration,
  toKoreanDurationLength,
  topicJosaFor,
} from "../formatDuration";

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

describe("toKoreanDurationLength — voice-tone.md §2 시간 길이(한글)", () => {
  it("1시간 이상은 'N시간 M분', M=0이면 'N시간'이다", () => {
    expect(toKoreanDurationLength(5048)).toBe("1시간 24분");
    expect(toKoreanDurationLength(4080)).toBe("1시간 8분");
    expect(toKoreanDurationLength(3600)).toBe("1시간");
    // 시가 있으면 초는 버린다 — 스크린리더용 toKoreanDuration과 갈리는 지점.
    expect(toKoreanDurationLength(3659)).toBe("1시간");
  });

  it("1시간 미만은 'M분'이다", () => {
    expect(toKoreanDurationLength(3120)).toBe("52분");
    expect(toKoreanDurationLength(90)).toBe("1분");
  });

  it("1분 미만은 'S초'다", () => {
    expect(toKoreanDurationLength(40)).toBe("40초");
    expect(toKoreanDurationLength(0)).toBe("0초");
    expect(toKoreanDurationLength(-5)).toBe("0초");
  });
});

describe("topicJosaFor — voice-tone.md §2 조사 자동 처리", () => {
  it("분·시간으로 끝나면 '은', 초로 끝나면 '는'이다", () => {
    expect(topicJosaFor("1시간 24분")).toBe("은");
    expect(topicJosaFor("1시간")).toBe("은");
    expect(topicJosaFor("52분")).toBe("은");
    expect(topicJosaFor("40초")).toBe("는");
  });
});
