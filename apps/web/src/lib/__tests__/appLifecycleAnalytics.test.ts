import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ToWebMessage } from "@focusmakers/types";

const mocks = vi.hoisted(() => ({
  setAppEnvironmentUserProperties: vi.fn(),
  setCameraPermissionUserProperty: vi.fn(),
  setThemeUserProperty: vi.fn(),
  trackAppLaunched: vi.fn(),
  isNativeBridgeAvailable: vi.fn(() => false),
  subscribeToNativeMessages: vi.fn(),
}));

vi.mock("@/lib/amplitude", () => ({
  setAppEnvironmentUserProperties: mocks.setAppEnvironmentUserProperties,
  setCameraPermissionUserProperty: mocks.setCameraPermissionUserProperty,
  setThemeUserProperty: mocks.setThemeUserProperty,
  trackAppLaunched: mocks.trackAppLaunched,
}));

vi.mock("@/lib/bridge", () => ({
  isNativeBridgeAvailable: mocks.isNativeBridgeAvailable,
  subscribeToNativeMessages: mocks.subscribeToNativeMessages,
}));

async function initAndGetHandler(): Promise<(message: ToWebMessage) => void> {
  const { initAppLifecycleAnalytics } = await import("../appLifecycleAnalytics");
  initAppLifecycleAnalytics();
  const [handler] = mocks.subscribeToNativeMessages.mock.calls[0] as [
    (message: ToWebMessage) => void,
  ];
  return handler;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
  delete document.documentElement.dataset.theme;
  window.history.replaceState({}, "", "/");
});

describe("initAppLifecycleAnalytics", () => {
  it("브리지 존재·?appVersion·data-theme로 앱 환경 user property를 설정한다", async () => {
    mocks.isNativeBridgeAvailable.mockReturnValue(true);
    window.history.replaceState({}, "", "/home?userId=7&appVersion=1.0.2");
    document.documentElement.dataset.theme = "dark";

    await initAndGetHandler();

    expect(mocks.setAppEnvironmentUserProperties).toHaveBeenCalledWith({
      isWebview: true,
      appVersion: "1.0.2",
      theme: "dark",
    });
  });

  it("브라우저 단독(쿼리·data-theme 없음)이면 appVersion을 null로, 테마는 미디어쿼리로 정한다", async () => {
    mocks.isNativeBridgeAvailable.mockReturnValue(false);

    await initAndGetHandler();

    expect(mocks.setAppEnvironmentUserProperties).toHaveBeenCalledWith({
      isWebview: false,
      appVersion: null,
      // jsdom에는 matchMedia가 없다 — 존재 검사를 지나 light 폴백이어야 한다.
      theme: "light",
    });
  });

  it("브리지 메시지를 각 이벤트·user property로 옮긴다", async () => {
    const handler = await initAndGetHandler();

    handler({ type: "app-launched", atMs: 1 });
    handler({ type: "camera-permission", granted: true, atMs: 4 });
    handler({ type: "theme", scheme: "dark", atMs: 6 });

    expect(mocks.trackAppLaunched).toHaveBeenCalledTimes(1);
    expect(mocks.setCameraPermissionUserProperty).toHaveBeenCalledWith(true);
    expect(mocks.setThemeUserProperty).toHaveBeenCalledWith("dark");
  });

  it("포/백그라운드·권한 게이트 결과는 여기서 다루지 않는다 — 네이티브 단일 sink(BY-616)의 몫", async () => {
    const handler = await initAndGetHandler();

    handler({ type: "app-state", state: "active", atMs: 2 });
    handler({ type: "app-state", state: "background", atMs: 3 });
    handler({ type: "camera-gate-result", granted: false, atMs: 5 });

    expect(mocks.trackAppLaunched).not.toHaveBeenCalled();
    expect(mocks.setCameraPermissionUserProperty).not.toHaveBeenCalled();
    expect(mocks.setThemeUserProperty).not.toHaveBeenCalled();
  });

  it("계측 대상이 아닌 메시지는 조용히 무시한다", async () => {
    const handler = await initAndGetHandler();

    handler({ type: "ping", id: 1, atMs: 7 });
    handler({ type: "reset-route", path: "/social", atMs: 8 });

    expect(mocks.trackAppLaunched).not.toHaveBeenCalled();
    expect(mocks.setCameraPermissionUserProperty).not.toHaveBeenCalled();
    expect(mocks.setThemeUserProperty).not.toHaveBeenCalled();
  });
});
