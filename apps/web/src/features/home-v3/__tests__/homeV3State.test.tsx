import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readHomeSubject, writeHomeSubject, reconcileHomeSubject } from "../subjectSelection";
import { useHomeDay } from "../useHomeDay";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { mockDeviceTimeZone } from "@/test/deviceTimeZone";

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("home subject selection", () => {
  it("keeps selection and explicit none separate for each account", () => {
    writeHomeSubject(7, 12);
    writeHomeSubject(8, null);
    expect(readHomeSubject(7)).toBe(12);
    expect(readHomeSubject(8)).toBeNull();
    expect(readHomeSubject(9)).toBeNull();
    expect(localStorage.getItem("home-v3:subject:8")).toBe("null");
  });

  it("clears deleted subjects only after a successful list, not on loading/failure", () => {
    expect(reconcileHomeSubject(12, undefined)).toBe(12);
    expect(reconcileHomeSubject(12, [{ id: 12 }])).toBe(12);
    expect(reconcileHomeSubject(12, [])).toBeNull();
  });

  it("ignores corrupt storage and survives unavailable localStorage", () => {
    localStorage.setItem("home-v3:subject:7", "{bad");
    expect(readHomeSubject(7)).toBeNull();
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("quota");
    });
    expect(() => writeHomeSubject(7, 12)).not.toThrow();
  });
});

describe("home day", () => {
  it("refreshes the local date and timezone on retained native tab return without DOM focus", () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date("2026-11-07T16:00:00Z"));
    mockDeviceTimeZone("Asia/Seoul");
    const { result } = renderHook(() => useHomeDay());
    expect(result.current).toEqual({ dateKey: "2026-11-08", timeZone: "Asia/Seoul" });
    const emit = (focused: boolean) => {
      const receiver = Reflect.get(globalThis, NATIVE_MESSAGE_ENTRY) as
        ((raw: string) => void) | undefined;
      receiver?.(JSON.stringify({ type: "tab-focus", focused, atMs: Date.now() }));
    };
    act(() => emit(false));
    mockDeviceTimeZone("America/Los_Angeles");
    act(() => emit(true));
    expect(result.current).toEqual({ dateKey: "2026-11-07", timeZone: "America/Los_Angeles" });
  });
  it("refreshes the day on app foreground without treating it as a tab switch", () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date("2026-11-07T14:59:00Z"));
    mockDeviceTimeZone("Asia/Seoul");
    const { result } = renderHook(() => useHomeDay());
    expect(result.current.dateKey).toBe("2026-11-07");
    vi.setSystemTime(new Date("2026-11-07T15:01:00Z"));
    act(() =>
      Reflect.get(
        globalThis,
        NATIVE_MESSAGE_ENTRY,
      )?.(JSON.stringify({ type: "app-visibility", visible: true, atMs: Date.now() })),
    );
    expect(result.current.dateKey).toBe("2026-11-08");
  });

  it("updates at device-local midnight, without waiting for the planner's 05:00", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 7, 23, 59, 59, 900));
    const { result } = renderHook(() => useHomeDay());
    expect(result.current.dateKey).toBe("2026-11-07");
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.dateKey).toBe("2026-11-08");
  });

  it("refreshes the date on return after suspension", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 7, 23, 0));
    const { result } = renderHook(() => useHomeDay());
    vi.setSystemTime(new Date(2026, 10, 9, 1, 0));
    act(() => window.dispatchEvent(new Event("focus")));
    expect(result.current.dateKey).toBe("2026-11-09");
  });
});
