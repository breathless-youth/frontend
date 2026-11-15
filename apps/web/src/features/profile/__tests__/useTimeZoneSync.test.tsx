import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setDeviceLocaleUserProperties } from "@/lib/amplitude";
import { deviceRegion } from "@/lib/deviceRegion";
import { updateProfile } from "@/lib/profileApi";
import { mockDeviceTimeZone } from "@/test/deviceTimeZone";

import { syncProfileTimeZone, useTimeZoneSync } from "../useTimeZoneSync";

vi.mock("@/lib/profileApi", () => ({ updateProfile: vi.fn() }));
vi.mock("@/lib/deviceRegion", () => ({ deviceRegion: vi.fn() }));
vi.mock("@/lib/amplitude", () => ({ setDeviceLocaleUserProperties: vi.fn() }));
const identity = vi.hoisted(() => ({ userId: 7 }));
vi.mock("@/lib/userId", () => ({
  assertCurrentUserId: (userId: number) => {
    if (identity.userId !== userId) throw new DOMException("Identity changed", "AbortError");
  },
}));

beforeEach(() => {
  identity.userId = 7;
  vi.mocked(deviceRegion).mockReturnValue(null);
  vi.mocked(updateProfile).mockResolvedValue({} as Awaited<ReturnType<typeof updateProfile>>);
});

afterEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe("useTimeZoneSync", () => {
  it("계정을 바꾸면 대기 중인 이전 계정의 시간대를 새 계정에 보내지 않는다", async () => {
    let finish!: () => void;
    vi.mocked(updateProfile).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = () => resolve({} as Awaited<ReturnType<typeof updateProfile>>);
      }),
    );
    const first = syncProfileTimeZone(7, "Asia/Seoul");
    const next = syncProfileTimeZone(7, "America/New_York");
    const firstResult = first.catch((error: unknown) => error);
    const nextResult = next.catch((error: unknown) => error);
    await waitFor(() => expect(updateProfile).toHaveBeenCalledOnce());
    identity.userId = 8;
    finish();
    await firstResult;
    expect(await nextResult).toMatchObject({ name: "AbortError" });
    expect(updateProfile).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem("focuson.profile.timeZoneSent")).toBeNull();
  });
  it("통계 조회가 같은 시간대 전송을 기다리면 진행 중인 요청을 공유한다", async () => {
    let finish!: () => void;
    vi.mocked(updateProfile).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = () => resolve({} as Awaited<ReturnType<typeof updateProfile>>);
      }),
    );
    const first = syncProfileTimeZone(7, "Asia/Seoul");
    const second = syncProfileTimeZone(7, "Asia/Seoul");
    expect(second).toBe(first);
    await waitFor(() => expect(updateProfile).toHaveBeenCalledOnce());
    finish();
    await Promise.all([first, second]);
  });
  it("신원이 준비되면 기기 시간대만 프로필에 보낸다", async () => {
    renderHook(() => useTimeZoneSync(7, false));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile).toHaveBeenCalledWith({ timeZone: "Asia/Seoul" });
  });

  it("기기 지역이 있으면 시간대와 함께 보내고 Amplitude 속성으로도 남긴다", async () => {
    vi.mocked(deviceRegion).mockReturnValue("TW");
    mockDeviceTimeZone("Asia/Taipei");
    renderHook(() => useTimeZoneSync(7, false));

    await waitFor(() =>
      expect(setDeviceLocaleUserProperties).toHaveBeenCalledWith({
        timeZone: "Asia/Taipei",
        region: "TW",
      }),
    );
    expect(updateProfile).toHaveBeenCalledWith({ timeZone: "Asia/Taipei", region: "TW" });
  });

  it("지역이 바뀌면 같은 시간대라도 다시 보낸다", async () => {
    vi.mocked(deviceRegion).mockReturnValue("SG");
    mockDeviceTimeZone("Asia/Singapore");
    renderHook(() => useTimeZoneSync(7, false)).unmount();
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    vi.mocked(deviceRegion).mockReturnValue("MY");
    renderHook(() => useTimeZoneSync(7, false));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(2));
    expect(updateProfile).toHaveBeenLastCalledWith({ timeZone: "Asia/Singapore", region: "MY" });
  });

  it("보내지 못하면 Amplitude 속성도 남기지 않는다", async () => {
    vi.mocked(updateProfile).mockRejectedValueOnce(new Error("network"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderHook(() => useTimeZoneSync(7, false));

    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(setDeviceLocaleUserProperties).not.toHaveBeenCalled();
    warn.mockRestore();
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

  it("변경 요청 중 원래 시간대로 돌아오면 앞선 응답 뒤에 원래 값을 보낸다", async () => {
    sessionStorage.setItem("focuson.profile.timeZoneSent", "7:Asia/Seoul");
    let acknowledge = () => {};
    const pending = new Promise<Awaited<ReturnType<typeof updateProfile>>>((resolve) => {
      acknowledge = () => resolve({} as Awaited<ReturnType<typeof updateProfile>>);
    });
    vi.mocked(updateProfile).mockReturnValueOnce(pending);
    const newYork = syncProfileTimeZone(7, "America/New_York");
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));

    const seoul = syncProfileTimeZone(7, "Asia/Seoul");
    expect(updateProfile).toHaveBeenCalledTimes(1);
    acknowledge();
    await Promise.all([newYork, seoul]);

    expect(vi.mocked(updateProfile).mock.calls).toEqual([
      [{ timeZone: "America/New_York" }],
      [{ timeZone: "Asia/Seoul" }],
    ]);
    expect(sessionStorage.getItem("focuson.profile.timeZoneSent")).toBe("7:Asia/Seoul");
  });
});
