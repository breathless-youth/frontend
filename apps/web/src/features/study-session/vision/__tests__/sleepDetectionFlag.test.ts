import { describe, expect, it } from "vitest";

import { isSleepDetectionEnabled } from "../sleepDetectionFlag";

describe("isSleepDetectionEnabled", () => {
  it("기본은 켜짐이다", () => {
    expect(isSleepDetectionEnabled("", false)).toBe(true);
    expect(isSleepDetectionEnabled("", true)).toBe(true);
  });

  it("개발 빌드에서는 sleep=0으로 끈다", () => {
    expect(isSleepDetectionEnabled("?sleep=0", true)).toBe(false);
  });

  it("프로덕션에서도 진단이 켜져 있으면 끌 수 있다 — 실기기 A/B가 프로덕션 번들에서 돈다", () => {
    expect(isSleepDetectionEnabled("?diag=1&sleep=0", false)).toBe(false);
  });

  it("프로덕션에서 진단 없이 붙인 sleep=0은 무시한다 — 사용자가 URL로 감지를 끌 이유가 없다", () => {
    expect(isSleepDetectionEnabled("?sleep=0", false)).toBe(true);
  });

  it("sleep=0 말고는 무시한다", () => {
    expect(isSleepDetectionEnabled("?sleep=1", true)).toBe(true);
    expect(isSleepDetectionEnabled("?sleep=off", true)).toBe(true);
  });

  it("손상된 질의 문자열에도 켜짐을 유지한다 — 스위치 때문에 감지가 죽으면 안 된다", () => {
    expect(isSleepDetectionEnabled("%", true)).toBe(true);
  });
});
