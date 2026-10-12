import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hasShownRecoveryThisLaunch, markRecoveryShownThisLaunch } from "../recoveryLaunchStore";

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("복구 창 표시 기록", () => {
  it("적기 전에는 없고, 적으면 이번 실행 동안 남는다", () => {
    expect(hasShownRecoveryThisLaunch()).toBe(false);

    markRecoveryShownThisLaunch();

    expect(hasShownRecoveryThisLaunch()).toBe(true);
  });

  it("읽지 못하면 떴다고 답해 랭킹 팝업을 쉬게 한다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(hasShownRecoveryThisLaunch()).toBe(true);
  });

  it("쓰지 못해도 throw하지 않는다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => markRecoveryShownThisLaunch()).not.toThrow();
  });
});
