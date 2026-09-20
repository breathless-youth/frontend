import { describe, expect, it } from "vitest";

import { FACE_BASELINE_MIN_RATIO, FACE_BASELINE_SAMPLES } from "../../visionConfig";
import { isPanelEnabled, isRehearsalEnabled, rehearsalBaseline } from "../flags";

describe("isRehearsalEnabled", () => {
  it("기본은 꺼짐이다", () => {
    expect(isRehearsalEnabled("", false)).toBe(false);
    expect(isRehearsalEnabled("userId=7", true)).toBe(false);
  });

  it("진단이 켜져 있을 때만 rehearsal=1이 듣는다", () => {
    expect(isRehearsalEnabled("rehearsal=1", true)).toBe(true);
    expect(isRehearsalEnabled("diag=1&rehearsal=1", false)).toBe(true);
    expect(isRehearsalEnabled("rehearsal=1", false)).toBe(false);
  });

  it("손상된 질의 문자열에도 켜지지 않는다", () => {
    expect(isRehearsalEnabled("%", true)).toBe(false);
  });
});

describe("rehearsalBaseline", () => {
  it("리허설이 아니면 설정값 그대로다", () => {
    expect(rehearsalBaseline(false)).toEqual({
      samples: FACE_BASELINE_SAMPLES,
      minRatio: FACE_BASELINE_MIN_RATIO,
    });
  });

  it("리허설이면 기준선 창을 짧게 줄인다 — 3분을 기다리지 않는다", () => {
    const baseline = rehearsalBaseline(true);

    expect(baseline.samples).toBeLessThan(FACE_BASELINE_SAMPLES);
    expect(baseline.samples).toBeGreaterThan(0);
    expect(baseline.minRatio).toBe(FACE_BASELINE_MIN_RATIO);
  });
});

/**
 * 패널은 진단보다 조건이 엄하다. 개발 빌드라는 이유로 화면에 붙으면 스터디룸을 만지는 사람의
 * 화면을 가리고, 화면 테스트의 DOM까지 오염시킨다. 측정하러 온 사람만 보면 된다.
 */
describe("isPanelEnabled", () => {
  it("diag=1이 실제로 붙었을 때만 켜진다", () => {
    expect(isPanelEnabled("diag=1")).toBe(true);
    expect(isPanelEnabled("?userId=7&diag=1")).toBe(true);
  });

  it("개발 빌드라는 이유만으로는 켜지지 않는다", () => {
    expect(isPanelEnabled("")).toBe(false);
    expect(isPanelEnabled("userId=7")).toBe(false);
    expect(isPanelEnabled("diag=0")).toBe(false);
  });

  it("손상된 질의 문자열에도 켜지지 않는다", () => {
    expect(isPanelEnabled("%")).toBe(false);
  });
});
