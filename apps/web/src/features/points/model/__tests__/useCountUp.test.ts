import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCountUp } from "../useCountUp";

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: reduce })),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  stubReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useCountUp", () => {
  it("처음 받은 값은 세지 않고 바로 보인다", () => {
    const { result, rerender } = renderHook(({ value }) => useCountUp(value), {
      initialProps: { value: undefined as number | undefined },
    });
    expect(result.current).toBeUndefined();
    rerender({ value: 300 });
    expect(result.current).toBe(300);
  });

  it("값이 늘면 이전 값에서 새 값까지 세어 올린다", () => {
    const { result, rerender } = renderHook(({ value }) => useCountUp(value), {
      initialProps: { value: 300 },
    });
    rerender({ value: 400 });
    expect(result.current).toBe(300);

    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBeGreaterThan(300);
    expect(result.current).toBeLessThan(400);

    act(() => vi.advanceTimersByTime(600));
    expect(result.current).toBe(400);
  });

  it("값이 줄면 바로 바꾼다", () => {
    const { result, rerender } = renderHook(({ value }) => useCountUp(value), {
      initialProps: { value: 300 },
    });
    rerender({ value: 290 });
    expect(result.current).toBe(290);
  });

  it("움직임 줄이기를 켠 기기에서는 바로 바꾼다", () => {
    stubReducedMotion(true);
    const { result, rerender } = renderHook(({ value }) => useCountUp(value), {
      initialProps: { value: 300 },
    });
    rerender({ value: 400 });
    expect(result.current).toBe(400);
  });
});
