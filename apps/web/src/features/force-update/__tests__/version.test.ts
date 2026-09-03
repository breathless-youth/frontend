import { describe, expect, it } from "vitest";

import { compareVersions, minSupportedVersion, shouldForceUpdate } from "../version";

describe("compareVersions", () => {
  it("같으면 0", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("작으면 -1", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
  });

  it("크면 1", () => {
    expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
  });

  it("세그먼트 개수가 달라도 비교한다", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.2", "1.1.9")).toBe(1);
  });

  it("세그먼트를 숫자로 비교한다 — 문자열 비교였다면 틀렸을 케이스", () => {
    expect(compareVersions("1.0.10", "1.0.9")).toBe(1);
  });

  it("숫자가 아닌 세그먼트는 던지지 않고 안전하게 처리한다", () => {
    expect(() => compareVersions("abc", "1.0.0")).not.toThrow();
    expect(compareVersions("1.0.x", "1.0.0")).toBe(0);
  });
});

describe("shouldForceUpdate", () => {
  it("null이면 강제하지 않는다(fail-open)", () => {
    expect(shouldForceUpdate(null)).toBe(false);
  });

  it("빈 문자열이면 강제하지 않는다", () => {
    expect(shouldForceUpdate("")).toBe(false);
  });

  it("파싱 불가 값이면 강제하지 않는다", () => {
    expect(shouldForceUpdate("not-a-version")).toBe(false);
  });

  it("세그먼트가 3자리가 아니면 강제하지 않는다(형식 이상 → fail-open)", () => {
    expect(shouldForceUpdate("0.9")).toBe(false);
    expect(shouldForceUpdate("1.0.0.0")).toBe(false);
  });

  it("최소 버전 이상이면 강제하지 않는다", () => {
    expect(shouldForceUpdate(minSupportedVersion())).toBe(false);
    expect(shouldForceUpdate("1.0.1")).toBe(false);
    expect(shouldForceUpdate("2.0.0")).toBe(false);
  });

  it("최소 버전 미만이면 강제한다", () => {
    expect(shouldForceUpdate("0.9.9")).toBe(true);
  });
});
