import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useElapsedSec } from "../useElapsedSec";

const FETCHED_AT_MS = new Date("2026-11-02T10:00:00+09:00").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FETCHED_AT_MS);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useElapsedSec", () => {
  it("받은 뒤 흐른 초를 1초마다 센다", () => {
    const { result } = renderHook(() => useElapsedSec(FETCHED_AT_MS, true));
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current).toBe(3);
  });

  it("순공이 쌓이는 사람이 없으면 타이머 없이 그대로다", () => {
    const setInterval = vi.spyOn(window, "setInterval");
    const { result } = renderHook(() => useElapsedSec(FETCHED_AT_MS, false));
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(result.current).toBe(0);
    expect(setInterval).not.toHaveBeenCalled();
  });

  it("받은 시각이 기기 시계보다 뒤여도 음수가 아니다", () => {
    const { result } = renderHook(() => useElapsedSec(FETCHED_AT_MS + 5_000, true));
    expect(result.current).toBe(0);
  });
});
