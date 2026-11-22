import { afterEach, describe, expect, it, vi } from "vitest";

import { __resetLiveActivityForTests, hasLiveActivity } from "@/lib/liveActivityCapability";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
  __resetLiveActivityForTests();
});

function open(path: string, bridge: boolean): void {
  if (bridge) {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
  }
  window.history.replaceState(null, "", path);
  __resetLiveActivityForTests();
}

describe("hasLiveActivity", () => {
  it("셸이 없는 브라우저는 보낼 곳이 없으므로 거짓이다", () => {
    open("/room/demo?liveActivity=1", false);

    expect(hasLiveActivity()).toBe(false);
  });

  it("셸이 liveActivity=1을 실었을 때만 참이다", () => {
    open("/room/demo?liveActivity=1", true);
    expect(hasLiveActivity()).toBe(true);

    open("/room/demo", true);
    expect(hasLiveActivity()).toBe(false);
  });

  it("앱 안 이동으로 쿼리가 사라져도 판정을 지킨다", () => {
    open("/room/demo?liveActivity=1", true);
    expect(hasLiveActivity()).toBe(true);

    window.history.replaceState(null, "", "/room/demo/result");
    expect(hasLiveActivity()).toBe(true);
  });
});
