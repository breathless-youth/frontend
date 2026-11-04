import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { updateProfile } from "@/lib/profileApi";
import { mockDeviceTimeZone } from "@/test/deviceTimeZone";

import { useTimeZoneSync } from "../useTimeZoneSync";

vi.mock("@/lib/profileApi", () => ({ updateProfile: vi.fn() }));

beforeEach(() => {
  vi.mocked(updateProfile).mockResolvedValue({} as Awaited<ReturnType<typeof updateProfile>>);
});

afterEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe("useTimeZoneSync", () => {
  it("신원이 준비되면 기기 시간대만 프로필에 보낸다", async () => {
    renderHook(() => useTimeZoneSync(7, false));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile).toHaveBeenCalledWith({ timeZone: "Asia/Seoul" });
  });

  it("같은 문서에서 같은 값은 다시 보내지 않는다", async () => {
    renderHook(() => useTimeZoneSync(7, false)).unmount();
    renderHook(() => useTimeZoneSync(7, false));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
  });

  it("값이 바뀌면 다시 보낸다", async () => {
    renderHook(() => useTimeZoneSync(7, false)).unmount();
    mockDeviceTimeZone("America/New_York");
    renderHook(() => useTimeZoneSync(7, false));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(2));
    expect(updateProfile).toHaveBeenLastCalledWith({ timeZone: "America/New_York" });
  });

  it("신원을 기다리는 중이거나 사용자가 없으면 보내지 않는다", () => {
    renderHook(() => useTimeZoneSync(null, true));
    renderHook(() => useTimeZoneSync(null, false));

    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("보내지 못했으면 다음 홈 진입에서 다시 보낸다", async () => {
    vi.mocked(updateProfile).mockRejectedValueOnce(new Error("network"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderHook(() => useTimeZoneSync(7, false)).unmount();
    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));

    renderHook(() => useTimeZoneSync(7, false));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(2));
    warn.mockRestore();
  });

  it("보내는 중에 홈이 다시 열려도 한 번만 보낸다", async () => {
    let resolve = () => {};
    vi.mocked(updateProfile).mockReturnValueOnce(
      new Promise((done) => {
        resolve = () => done({} as Awaited<ReturnType<typeof updateProfile>>);
      }),
    );
    renderHook(() => useTimeZoneSync(7, false)).unmount();
    renderHook(() => useTimeZoneSync(7, false));
    resolve();

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
  });

  it("보내지 못해도 예외를 밖으로 내지 않는다", async () => {
    vi.mocked(updateProfile).mockRejectedValue(new Error("network"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderHook(() => useTimeZoneSync(7, false));

    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    warn.mockRestore();
  });
});
