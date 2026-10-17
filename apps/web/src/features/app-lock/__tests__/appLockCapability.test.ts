import { afterEach, expect, it, vi } from "vitest";

import { __resetAppLockCapabilityForTests, hasAppLockCapability } from "../appLockCapability";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
  __resetAppLockCapabilityForTests();
});

function open(path: string, bridge: boolean): void {
  if (bridge) {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
  }
  window.history.replaceState(null, "", path);
  __resetAppLockCapabilityForTests();
}

it("셸이 appLock=1을 실었을 때만 참이다", () => {
  open("/settings?appLock=1", true);
  expect(hasAppLockCapability()).toBe(true);

  open("/settings", true);
  expect(hasAppLockCapability()).toBe(false);
});

it("브라우저에는 잠글 수단이 없어 거짓이다", () => {
  open("/settings?appLock=1", false);
  expect(hasAppLockCapability()).toBe(false);
});

it("앱 안 이동으로 쿼리가 사라져도 판정을 지킨다", () => {
  open("/settings?appLock=1", true);
  expect(hasAppLockCapability()).toBe(true);

  window.history.replaceState(null, "", "/app-lock-settings");
  expect(hasAppLockCapability()).toBe(true);
});
