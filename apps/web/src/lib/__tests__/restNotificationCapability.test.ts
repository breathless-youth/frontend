import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetRestNotificationForTests,
  hasRestNotification,
} from "@/lib/restNotificationCapability";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
  __resetRestNotificationForTests();
});

function open(path: string, bridge: boolean): void {
  if (bridge) {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
  }
  window.history.replaceState(null, "", path);
  __resetRestNotificationForTests();
}

describe("hasRestNotification", () => {
  it("셸이 없는 브라우저는 앱 안 알림만 쓰므로 참이다", () => {
    open("/room/demo", false);

    expect(hasRestNotification()).toBe(true);
  });

  it("앱은 셸이 restNotify=1을 실었을 때만 참이다", () => {
    open("/room/demo", true);
    expect(hasRestNotification()).toBe(false);

    open("/room/demo?restNotify=1", true);
    expect(hasRestNotification()).toBe(true);
  });
});
