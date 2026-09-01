import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useToast } from "../useToast";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useToast", () => {
  it("기본 유지시간은 5초다 — 4.9초에는 남아 있고 5초에 사라진다", () => {
    const hook = renderHook(() => useToast());
    act(() => {
      hook.result.current.showToast("안내");
    });
    act(() => {
      vi.advanceTimersByTime(4900);
    });
    expect(hook.result.current.message).toBe("안내");
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(hook.result.current.message).toBeNull();
  });
});
