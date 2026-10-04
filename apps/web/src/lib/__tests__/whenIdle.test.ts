import { afterEach, describe, expect, it, vi } from "vitest";

import { IDLE_FALLBACK_MS, IDLE_TIMEOUT_MS, whenIdle } from "../whenIdle";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("whenIdle", () => {
  it("requestIdleCallback이 있으면 유휴 콜백에서 실행한다", () => {
    const callbacks: IdleRequestCallback[] = [];
    vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
      callbacks.push(callback);
      return 1;
    });
    const task = vi.fn();

    whenIdle(task);
    expect(task).not.toHaveBeenCalled();

    callbacks[0]?.({ didTimeout: false, timeRemaining: () => 50 });
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("유휴 구간이 오지 않아도 3초 안에 실행되도록 timeout을 건다", () => {
    const requestIdle = vi.fn(() => 1);
    vi.stubGlobal("requestIdleCallback", requestIdle);

    whenIdle(() => {});

    expect(requestIdle).toHaveBeenCalledWith(expect.any(Function), { timeout: IDLE_TIMEOUT_MS });
    expect(IDLE_TIMEOUT_MS).toBe(3_000);
  });

  it("requestIdleCallback이 없으면 1.5초 뒤에 실행한다", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const task = vi.fn();

    whenIdle(task);
    vi.advanceTimersByTime(IDLE_FALLBACK_MS - 1);
    expect(task).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
