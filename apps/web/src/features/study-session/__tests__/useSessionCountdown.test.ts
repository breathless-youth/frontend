import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSessionCountdown } from "../useSessionCountdown";

describe("useSessionCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("1초마다 줄고 다 세면 한 번 알린다", () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useSessionCountdown(3, onDone));
    expect(result.current).toBe(3);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(1);
    expect(onDone).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("멈춤을 받는 동안에는 세지 않고 풀린 뒤부터 처음 초를 센다", () => {
    const onDone = vi.fn();
    const { result, rerender } = renderHook(({ held }) => useSessionCountdown(3, onDone, held), {
      initialProps: { held: true },
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(3);
    expect(onDone).not.toHaveBeenCalled();

    rerender({ held: false });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("화면이 가려진 동안에는 세지 않는다", () => {
    const onDone = vi.fn();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    renderHook(() => useSessionCountdown(3, onDone));

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDone).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("다 셀 때는 가장 최근에 받은 완료 함수를 부른다", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = renderHook(({ onDone }) => useSessionCountdown(3, onDone), {
      initialProps: { onDone: first },
    });
    rerender({ onDone: latest });

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it("0초면 세지 않고 알리지도 않는다", () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useSessionCountdown(0, onDone));

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(0);
    expect(onDone).not.toHaveBeenCalled();
  });
});
