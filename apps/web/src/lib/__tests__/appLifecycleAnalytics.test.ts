import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ToWebMessage } from "@focusmakers/types";
import { ANALYTICS_USER_PROPERTY_NAME_PATTERN } from "@focusmakers/types";

const mocks = vi.hoisted(() => ({
  setAppEnvironmentUserProperties: vi.fn(),
  setCameraPermissionUserProperty: vi.fn(),
  setThemeUserProperty: vi.fn(),
  trackAppLaunched: vi.fn(),
  isNativeBridgeAvailable: vi.fn(() => false),
  subscribeToNativeMessages: vi.fn(),
  postToNative: vi.fn((_message: unknown) => false),
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
  postToNative: mocks.postToNative,
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

  it("옛 initial_* Firebase 속성 19개를 null로 한 메시지에 담아 문서당 한 번 지운다", async () => {
    const { initAppLifecycleAnalytics } = await import("../appLifecycleAnalytics");
    initAppLifecycleAnalytics();
    initAppLifecycleAnalytics();

    const clears = mocks.postToNative.mock.calls.filter(
      ([message]) => (message as { type: string }).type === "analytics-user-properties",
    );
    expect(clears).toHaveLength(1);
    const [message] = clears[0] as [{ properties: Record<string, null> }];
    const keys = Object.keys(message.properties);
    expect(keys).toHaveLength(19);
    for (const key of keys) {
      expect(key).toMatch(/^initial_/);
      expect(key).toMatch(ANALYTICS_USER_PROPERTY_NAME_PATTERN);
    }
    expect(Object.values(message.properties).every((value) => value === null)).toBe(true);
  });

  it("브리지가 없어 전송이 실패해도 영속 플래그를 두지 않아 다음 문서에서 다시 보낸다", async () => {
    mocks.postToNative.mockReturnValue(false);
    const first = await import("../appLifecycleAnalytics");
    first.initAppLifecycleAnalytics();
    expect(mocks.postToNative).toHaveBeenCalledTimes(1);

    vi.resetModules();
    const second = await import("../appLifecycleAnalytics");
    second.initAppLifecycleAnalytics();
    expect(mocks.postToNative).toHaveBeenCalledTimes(2);
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

  it("권한 게이트 결과는 여기서 다루지 않는다 — 네이티브 단일 sink의 몫", async () => {
    const handler = await initAndGetHandler();

    handler({ type: "camera-gate-result", granted: false, atMs: 5 });

    expect(mocks.trackAppLaunched).not.toHaveBeenCalled();
    expect(mocks.setCameraPermissionUserProperty).not.toHaveBeenCalled();
    expect(mocks.setThemeUserProperty).not.toHaveBeenCalled();
  });

  it("계측 대상이 아닌 메시지는 조용히 무시한다", async () => {
    const handler = await initAndGetHandler();

    handler({ type: "session-closed", atMs: 7 });
    handler({ type: "reset-route", path: "/social", atMs: 8 });

    expect(mocks.trackAppLaunched).not.toHaveBeenCalled();
    expect(mocks.setCameraPermissionUserProperty).not.toHaveBeenCalled();
    expect(mocks.setThemeUserProperty).not.toHaveBeenCalled();
  });
});
