import { QueryClient, QueryClientProvider, focusManager, useQuery } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import {
  __resetNativeTabFocusForTests,
  initNativeTabFocus,
  useScreenVisible,
} from "@/lib/nativeTabFocus";

function emit(focused: boolean): void {
  const receiver = (globalThis as unknown as Record<string, ((raw: string) => void) | undefined>)[
    NATIVE_MESSAGE_ENTRY
  ];
  receiver?.(JSON.stringify({ type: "tab-focus", focused, atMs: 1 }));
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
});

afterEach(() => {
  act(() => __resetNativeTabFocusForTests());
  setVisibility("visible");
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("initNativeTabFocus", () => {
  it("첫 신호 전에는 보이는 것으로 본다", () => {
    initNativeTabFocus();

    act(() => setVisibility("hidden"));
    act(() => setVisibility("visible"));

    expect(focusManager.isFocused()).toBe(true);
  });

  it("tab-focus에 따라 보임이 바뀐다", () => {
    initNativeTabFocus();

    act(() => emit(false));
    expect(focusManager.isFocused()).toBe(false);

    act(() => emit(true));
    expect(focusManager.isFocused()).toBe(true);
  });

  it("탭이 보여도 문서가 숨으면 가려진 것으로 본다", () => {
    initNativeTabFocus();

    act(() => setVisibility("hidden"));

    expect(focusManager.isFocused()).toBe(false);
  });

  it("셸이 없으면 연결하지 않는다", () => {
    vi.unstubAllGlobals();
    initNativeTabFocus();

    act(() => emit(false));

    expect(focusManager.isFocused()).toBe(true);
  });

  it("useScreenVisible이 신호를 따라 다시 그린다", () => {
    initNativeTabFocus();
    const { result } = renderHook(() => useScreenVisible());

    act(() => emit(false));

    expect(result.current).toBe(false);
  });

  it("가려진 동안은 폴링하지 않고, 다시 보이면 받는다", async () => {
    vi.useFakeTimers();
    initNativeTabFocus();
    const queryFn = vi.fn().mockResolvedValue(1);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    renderHook(
      () =>
        useQuery({
          queryKey: ["poll"],
          queryFn,
          refetchInterval: 15_000,
          refetchIntervalInBackground: false,
        }),
      { wrapper },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(queryFn).toHaveBeenCalledTimes(1);

    act(() => emit(false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(queryFn).toHaveBeenCalledTimes(1);

    act(() => emit(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});
