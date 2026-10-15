import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useNow } from "../useNow";

afterEach(() => vi.useRealTimers());

describe("useNow", () => {
  it("간격 단위로 내린 시각을 주고 간격마다 바뀐다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_500);
    const { result } = renderHook(() => useNow(1000));

    expect(result.current).toBe(10_000);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(11_000);
  });

  it("null이면 타이머를 두지 않는다", () => {
    const setInterval = vi.spyOn(window, "setInterval");

    renderHook(() => useNow(null));

    expect(setInterval).not.toHaveBeenCalled();
    setInterval.mockRestore();
  });
});
