import { afterEach, describe, expect, it, vi } from "vitest";

import { __resetRankingTabForTests, hasRankingTab } from "@/lib/rankingCapability";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
  __resetRankingTabForTests();
});

function open(path: string, bridge: boolean): void {
  if (bridge) {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
  }
  window.history.replaceState(null, "", path);
  __resetRankingTabForTests();
}

describe("hasRankingTab", () => {
  it("셸이 없는 브라우저는 웹 라우트로 열 수 있어 참이다", () => {
    open("/home", false);

    expect(hasRankingTab()).toBe(true);
  });

  it("셸이 ranking=1을 실었을 때만 참이다", () => {
    open("/home?ranking=1", true);
    expect(hasRankingTab()).toBe(true);

    open("/home", true);
    expect(hasRankingTab()).toBe(false);
  });

  it("앱 안 이동으로 쿼리가 사라져도 판정을 지킨다", () => {
    open("/home?ranking=1", true);
    expect(hasRankingTab()).toBe(true);

    window.history.replaceState(null, "", "/records");
    expect(hasRankingTab()).toBe(true);
  });
});
