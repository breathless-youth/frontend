import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mockDeviceTimeZone } from "@/test/deviceTimeZone";

import { usePlannerClock } from "../usePlannerClock";

afterEach(() => vi.useRealTimers());

describe("플래너 현재 날짜", () => {
  it("화면을 켜 둔 채 05시를 지나면 오늘이 바뀐다", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-11-05T04:59:59+09:00"));
    const { result } = renderHook(() => usePlannerClock());

    expect(result.current.todayKey).toBe("2026-11-04");
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.todayKey).toBe("2026-11-05");
    expect(result.current.nowMs).toBe(Date.parse("2026-11-05T05:00:00+09:00"));
  });

  it("앱에 돌아오면 타이머를 기다리지 않고 오늘을 갱신한다", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-11-05T04:59:00+09:00"));
    const { result } = renderHook(() => usePlannerClock());

    act(() => {
      vi.setSystemTime(new Date("2026-11-05T06:00:00+09:00"));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.todayKey).toBe("2026-11-05");
    expect(result.current.nowMs).toBe(Date.parse("2026-11-05T06:00:00+09:00"));
  });

  it("포커스를 되찾을 때 바뀐 기기 시간대를 적용한다", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-11-05T06:00:00+09:00"));
    const { result } = renderHook(() => usePlannerClock());
    expect(result.current.todayKey).toBe("2026-11-05");

    mockDeviceTimeZone("America/New_York");
    act(() => window.dispatchEvent(new Event("focus")));

    expect(result.current).toEqual({
      nowMs: Date.parse("2026-11-05T06:00:00+09:00"),
      todayKey: "2026-11-04",
      timeZone: "America/New_York",
    });
  });
});
