import { afterEach, describe, expect, it, vi } from "vitest";

import { __resetAlertHapticForTests, hasAlertHaptic } from "@/lib/alertHapticCapability";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
  __resetAlertHapticForTests();
});

function open(path: string, bridge: boolean): void {
  if (bridge) {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
  }
  window.history.replaceState(null, "", path);
  __resetAlertHapticForTests();
}

describe("hasAlertHaptic", () => {
  it("셸이 없는 브라우저는 진동 길이로 바꿔 내므로 참이다", () => {
    open("/room/demo", false);

    expect(hasAlertHaptic()).toBe(true);
  });

  it("셸이 alertHaptic=1을 실었을 때만 참이다", () => {
    open("/room/demo?alertHaptic=1", true);
    expect(hasAlertHaptic()).toBe(true);

    open("/room/demo", true);
    expect(hasAlertHaptic()).toBe(false);
  });

  it("앱 안 이동으로 쿼리가 사라져도 판정을 지킨다", () => {
    open("/room/demo?alertHaptic=1", true);
    expect(hasAlertHaptic()).toBe(true);

    window.history.replaceState(null, "", "/room/demo/result");
    expect(hasAlertHaptic()).toBe(true);
  });
});
