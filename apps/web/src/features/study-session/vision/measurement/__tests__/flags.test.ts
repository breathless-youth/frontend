import { describe, expect, it } from "vitest";

import { isPanelEnabled } from "../flags";

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
