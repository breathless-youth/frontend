import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import { showToast } from "@/lib/toast";

import { hasAppLockCapability } from "../appLockCapability";
import { readAppLockEnabled, writeAppLockEnabled } from "../appLockSettings";
import { queryAppLock } from "../nativeAppLock";
import { useAppLockRevokeCheck } from "../useAppLockRevokeCheck";

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("../appLockCapability", () => ({ hasAppLockCapability: vi.fn(() => true) }));
vi.mock("../nativeAppLock", () => ({ queryAppLock: vi.fn() }));
const analytics = vi.hoisted(() => ({
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
  revoked: true,
  appCount: 0,
  categoryCount: 0,
};

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setVisibility("visible");
});

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

function returnToApp(): void {
  setVisibility("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  setVisibility("visible");
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useAppLockRevokeCheck", () => {
  it("켜져 있는데 권한이 꺼졌으면 알리지 않고 기능을 끈다", async () => {
    writeAppLockEnabled(true);
    vi.mocked(queryAppLock).mockResolvedValue(STATE);
    renderHook(() => useAppLockRevokeCheck());
    await waitFor(() => expect(readAppLockEnabled()).toBe(false));
    expect(showToast).not.toHaveBeenCalled();
    expect(analytics.trackAppLockToggled).toHaveBeenCalledWith({
      on: false,
      source: "permission_lost",
    });
    expect(analytics.setAppLockEnabledUserProperty).toHaveBeenLastCalledWith(false);
  });

  it("권한이 그대로면 아무것도 하지 않는다", async () => {
    writeAppLockEnabled(true);
    vi.mocked(queryAppLock).mockResolvedValue({ ...STATE, authorized: true, revoked: false });
    renderHook(() => useAppLockRevokeCheck());
    await waitFor(() => expect(queryAppLock).toHaveBeenCalled());
    await Promise.resolve();
    expect(readAppLockEnabled()).toBe(true);
    expect(showToast).not.toHaveBeenCalled();
  });

  it("홈이 떠 있는 채로 설정 앱에서 권한을 끄고 돌아오면 그때 끈다", async () => {
    writeAppLockEnabled(true);
    vi.mocked(queryAppLock).mockResolvedValueOnce({ ...STATE, authorized: true, revoked: false });
    renderHook(() => useAppLockRevokeCheck());
    await waitFor(() => expect(queryAppLock).toHaveBeenCalledTimes(1));

    vi.mocked(queryAppLock).mockResolvedValue(STATE);
    returnToApp();
    await waitFor(() => expect(readAppLockEnabled()).toBe(false));
    expect(queryAppLock).toHaveBeenCalledTimes(2);
    expect(analytics.trackAppLockToggled).toHaveBeenCalledTimes(1);
  });

  it("묻는 중에 다시 돌아와도 한 번만 묻는다", async () => {
    writeAppLockEnabled(true);
    let answer: (state: typeof STATE) => void = () => undefined;
    vi.mocked(queryAppLock).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderHook(() => useAppLockRevokeCheck());
    returnToApp();
    returnToApp();
    expect(queryAppLock).toHaveBeenCalledTimes(1);
    answer(STATE);
    await waitFor(() => expect(analytics.trackAppLockToggled).toHaveBeenCalledTimes(1));
  });

  it("꺼져 있거나 기능 조회가 없으면 묻지 않는다", () => {
    renderHook(() => useAppLockRevokeCheck());
    writeAppLockEnabled(true);
    vi.mocked(hasAppLockCapability).mockReturnValueOnce(false);
    renderHook(() => useAppLockRevokeCheck());
    expect(queryAppLock).not.toHaveBeenCalled();
  });
});
