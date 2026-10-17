import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import { showToast } from "@/lib/toast";

import { readAppLockEnabled, writeAppLockEnabled } from "../appLockSettings";
import { authorizeAppLock, pickAppLockApps, queryAppLock } from "../nativeAppLock";
import { useAppLockSettings } from "../useAppLockSettings";

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("../nativeAppLock", () => ({
  queryAppLock: vi.fn(),
  authorizeAppLock: vi.fn(),
  pickAppLockApps: vi.fn(),
}));
const analytics = vi.hoisted(() => ({
  trackAppLockPermissionResult: vi.fn(),
  trackAppLockAppsSelected: vi.fn(),
  trackAppLockToggled: vi.fn(),
  setAppLockEnabledUserProperty: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  ...analytics,
}));

const STATE = {
  supported: true,
  authorized: false,
  revoked: false,
  appCount: 3,
  categoryCount: 1,
};

beforeEach(() => {
  vi.mocked(queryAppLock).mockResolvedValue(STATE);
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

async function renderSettings() {
  const view = renderHook(() => useAppLockSettings());
  await waitFor(() => expect(view.result.current.appCount).toBe(3));
  return view;
}

describe("useAppLockSettings", () => {
  it("열면 저장된 켜짐과 네이티브의 개수를 보여 준다", async () => {
    writeAppLockEnabled(true);
    const { result } = await renderSettings();
    expect(result.current).toMatchObject({ enabled: true, appCount: 3, categoryCount: 1 });
  });

  it("처음 상태를 받아 오는 동안은 바쁨이라 스위치를 못 누른다", async () => {
    let answer: (state: typeof STATE | null) => void = () => undefined;
    vi.mocked(queryAppLock).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { result } = renderHook(() => useAppLockSettings());
    expect(result.current.busy).toBe(true);
    await act(async () => answer(null));
    expect(result.current.busy).toBe(false);
  });

  it("iOS 18 미만이면 켜지 않고 안내한다", async () => {
    vi.mocked(authorizeAppLock).mockResolvedValue({ ...STATE, supported: false });
    const { result } = await renderSettings();
    await act(() => result.current.toggle(true));
    expect(result.current.enabled).toBe(false);
    expect(showToast).toHaveBeenCalledWith("방해 앱 잠금은 iOS 18 이상에서 쓸 수 있어요");
  });

  it("허용하면 켜고 저장한다", async () => {
    vi.mocked(authorizeAppLock).mockResolvedValue({ ...STATE, authorized: true });
    const { result } = await renderSettings();
    await act(() => result.current.toggle(true));
    expect(result.current.enabled).toBe(true);
    expect(readAppLockEnabled()).toBe(true);
    expect(analytics.trackAppLockPermissionResult).toHaveBeenCalledWith({ granted: true });
    expect(analytics.trackAppLockToggled).toHaveBeenCalledWith({ on: true, source: "settings" });
    expect(analytics.setAppLockEnabledUserProperty).toHaveBeenLastCalledWith(true);
    expect(showToast).not.toHaveBeenCalled();
  });

  it("권한 창에서 거부하면 끈 채로 두고 안내하지 않는다", async () => {
    vi.mocked(authorizeAppLock).mockResolvedValue(STATE);
    const { result } = await renderSettings();
    await act(() => result.current.toggle(true));
    expect(result.current.enabled).toBe(false);
    expect(analytics.trackAppLockPermissionResult).toHaveBeenCalledWith({ granted: false });
    expect(showToast).not.toHaveBeenCalled();
  });

  it("응답이 없으면 끈 채로 둔다", async () => {
    vi.mocked(authorizeAppLock).mockResolvedValue(null);
    const { result } = await renderSettings();
    await act(() => result.current.toggle(true));
    expect(result.current.enabled).toBe(false);
    expect(showToast).not.toHaveBeenCalled();
  });

  it("끄면 저장하고 이벤트를 남긴다", async () => {
    writeAppLockEnabled(true);
    const { result } = await renderSettings();
    await act(() => result.current.toggle(false));
    expect(result.current.enabled).toBe(false);
    expect(readAppLockEnabled()).toBe(false);
    expect(analytics.trackAppLockToggled).toHaveBeenCalledWith({ on: false, source: "settings" });
    expect(analytics.setAppLockEnabledUserProperty).toHaveBeenLastCalledWith(false);
  });

  it("고르기가 끝나면 개수를 바꾸고 이벤트에 개수만 싣는다", async () => {
    vi.mocked(pickAppLockApps).mockResolvedValue({ ...STATE, appCount: 5, categoryCount: 0 });
    const { result } = await renderSettings();
    await act(() => result.current.pick());
    expect(result.current).toMatchObject({ appCount: 5, categoryCount: 0 });
    expect(analytics.trackAppLockAppsSelected).toHaveBeenCalledWith({
      appCount: 5,
      categoryCount: 0,
    });
  });
});
