import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetAppLockCapabilityForTests } from "@/features/app-lock/appLockCapability";
import {
  authorizeAppLock,
  openAppLockBatteryGuide,
  pickAppLockApps,
  queryAppLock,
} from "@/features/app-lock/nativeAppLock";
import { AppLockSettingsPage } from "@/routes/AppLockSettingsPage";

vi.mock("@/features/app-lock/nativeAppLock", () => ({
  queryAppLock: vi.fn(),
  authorizeAppLock: vi.fn(),
  pickAppLockApps: vi.fn(),
  openAppLockBatteryGuide: vi.fn(),
}));

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-A235N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

function inApp(userAgent: string) {
  vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
  window.history.replaceState(null, "", "/app-lock-settings?appLock=1");
  __resetAppLockCapabilityForTests();
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
}

const STATE = {
  supported: true,
  authorized: true,
  revoked: false,
  appCount: 3,
  categoryCount: 1,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/app-lock-settings"]}>
      <AppLockSettingsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(queryAppLock).mockResolvedValue(STATE);
  vi.mocked(authorizeAppLock).mockResolvedValue(STATE);
  vi.mocked(pickAppLockApps).mockResolvedValue({ ...STATE, appCount: 0, categoryCount: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  __resetAppLockCapabilityForTests();
});

describe("설정 › 방해 앱 잠금", () => {
  it("꺼져 있으면 잠긴 앱 행 없이 스위치와 기능 설명만 보인다", async () => {
    renderPage();
    expect(await screen.findByRole("switch", { name: "방해 앱 잠금" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.queryByRole("button", { name: /잠긴 앱/ })).toBeNull();
    expect(screen.getByText("기능 설명")).toBeTruthy();
    expect(screen.getByText("공부를 시작하면 잠기고, 공부를 끝내면 풀려요.")).toBeTruthy();
    expect(screen.queryByText("일시정지 중에도 잠겨 있어요.")).toBeNull();
  });

  it("켜면 잠긴 앱 행이 요약과 함께 나타나고, 누르면 고르기를 연다", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("switch", { name: "방해 앱 잠금" }));

    const row = await screen.findByRole("button", { name: "잠긴 앱, 앱 3개 · 카테고리 1개" });
    fireEvent.click(row);
    expect(pickAppLockApps).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "잠긴 앱, 선택 안 함" })).toBeTruthy();
  });

  it("툴팁 버튼이 있다", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: "방해 앱 잠금 안내" })).toBeTruthy();
  });

  it("Android 앱에서는 꺼져 있어도 배터리 설정 안내 행이 있고, 누르면 안내를 연다", async () => {
    inApp(ANDROID_UA);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "배터리 설정 안내" }));
    expect(openAppLockBatteryGuide).toHaveBeenCalled();
  });

  it("방해 앱 잠금을 쓸 수 없는 Android 기기에는 배터리 설정 안내 행이 없다", async () => {
    inApp(ANDROID_UA);
    vi.mocked(queryAppLock).mockResolvedValue({ ...STATE, supported: false });
    renderPage();
    const toggle = await screen.findByRole("switch", { name: "방해 앱 잠금" });
    // 스위치가 풀리면 첫 상태를 받은 뒤다.
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(screen.queryByRole("button", { name: "배터리 설정 안내" })).toBeNull();
  });

  it("iOS 앱에는 배터리 설정 안내 행이 없다", async () => {
    inApp(IOS_UA);
    renderPage();
    await screen.findByRole("switch", { name: "방해 앱 잠금" });
    expect(screen.queryByRole("button", { name: "배터리 설정 안내" })).toBeNull();
  });

  it("브라우저에서는 Android여도 배터리 설정 안내 행이 없다", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ANDROID_UA);
    renderPage();
    await screen.findByRole("switch", { name: "방해 앱 잠금" });
    expect(screen.queryByRole("button", { name: "배터리 설정 안내" })).toBeNull();
  });
});
