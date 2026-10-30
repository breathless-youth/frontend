import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetNativeDateBarForTests,
  useNativeDateBarShown,
  useNativeHomeDateBar,
} from "../nativeHomeDateBar";

function sendFromNative(message: Record<string, unknown>) {
  act(() => {
    (window as unknown as Record<string, (raw: string) => void>).__focusonNativeMessage(
      JSON.stringify({ atMs: 1, ...message }),
    );
  });
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
  __resetNativeDateBarForTests();
  vi.unstubAllGlobals();
});

describe("useNativeHomeDateBar", () => {
  it("nativeDateBar=1이면 날짜 목록을 보내고 앱에서 누른 날을 고른다", () => {
    window.history.replaceState(null, "", "/home?nativeDateBar=1");
    __resetNativeDateBarForTests();
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    const onSelect = vi.fn();
    const onMenuAction = vi.fn();

    const { unmount } = renderHook(() =>
      useNativeHomeDateBar({
        todayKey: "2026-10-29",
        selectedKey: "2026-10-29",
        onSelect,
        onMenuAction,
      }),
    );

    const sent = JSON.parse(postMessage.mock.calls[0]?.[0] as string) as {
      type: string;
      dates: { key: string; label: string }[];
    };
    expect(sent.type).toBe("set-home-date-bar");
    expect(sent.dates).toHaveLength(30);
    expect(sent.dates.at(-1)).toEqual({
      key: "2026-10-29",
      label: "29일 (목)",
      accessibilityLabel: "10월 29일 목요일, 오늘",
    });

    sendFromNative({ type: "home-date-selected", dateKey: "2026-10-27" });
    sendFromNative({ type: "home-date-selected", dateKey: "2025-01-01" });
    sendFromNative({ type: "home-menu-action", action: "reorder-subjects" });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("2026-10-27");
    expect(onMenuAction).toHaveBeenCalledExactlyOnceWith("reorder-subjects");

    unmount();
    const last = JSON.parse(postMessage.mock.calls.at(-1)?.[0] as string) as { dates: unknown[] };
    expect(last.dates).toEqual([]);
  });

  it("고른 날이 바뀌면 그 날을 담아 다시 보낸다", () => {
    window.history.replaceState(null, "", "/home?nativeDateBar=1");
    __resetNativeDateBarForTests();
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    const { rerender } = renderHook(
      ({ selectedKey }) =>
        useNativeHomeDateBar({ todayKey: "2026-10-29", selectedKey, onSelect: vi.fn() }),
      { initialProps: { selectedKey: "2026-10-29" } },
    );
    rerender({ selectedKey: "2026-10-27" });

    expect(postMessage).toHaveBeenCalledTimes(2);
    const sent = JSON.parse(postMessage.mock.calls[1]?.[0] as string) as {
      selectedKey: string;
      todayKey: string;
    };
    expect(sent).toMatchObject({ selectedKey: "2026-10-27", todayKey: "2026-10-29" });
  });

  it("숨기는 동안 빈 목록을 보내고 숨김이 풀리면 날짜 목록을 다시 보낸다", () => {
    window.history.replaceState(null, "", "/home?nativeDateBar=1");
    __resetNativeDateBarForTests();
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    const sentDates = () =>
      postMessage.mock.calls.map(
        ([raw]) => (JSON.parse(raw as string) as { dates: unknown[] }).dates.length,
      );

    const { rerender } = renderHook(
      ({ hidden }) =>
        useNativeHomeDateBar({
          todayKey: "2026-10-29",
          selectedKey: "2026-10-29",
          onSelect: vi.fn(),
          hidden,
        }),
      { initialProps: { hidden: false } },
    );
    rerender({ hidden: true });
    expect(sentDates().at(-1)).toBe(0);

    rerender({ hidden: false });
    expect(sentDates().at(-1)).toBe(30);
  });

  it("메뉴 처리를 넘기지 않아도 앱 메뉴 알림을 받으면 넘어가지 않는다", () => {
    window.history.replaceState(null, "", "/home?nativeDateBar=1");
    __resetNativeDateBarForTests();
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });

    renderHook(() =>
      useNativeHomeDateBar({
        todayKey: "2026-10-29",
        selectedKey: "2026-10-29",
        onSelect: vi.fn(),
      }),
    );

    expect(() =>
      sendFromNative({ type: "home-menu-action", action: "reorder-subjects" }),
    ).not.toThrow();
  });

  it("표시가 없으면 아무것도 보내지 않는다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    renderHook(() =>
      useNativeHomeDateBar({
        todayKey: "2026-10-29",
        selectedKey: "2026-10-29",
        onSelect: vi.fn(),
      }),
    );

    expect(postMessage).not.toHaveBeenCalled();
  });
});

// 토스트는 앱 날짜 줄이 실제로 떠 있을 때만 그 위로 올라가야 해서, 웹이 보낸 마지막 상태를 따라간다.
describe("useNativeDateBarShown", () => {
  function useBoth(hidden: boolean) {
    useNativeHomeDateBar({
      todayKey: "2026-10-29",
      selectedKey: "2026-10-29",
      onSelect: vi.fn(),
      hidden,
    });
    return useNativeDateBarShown();
  }

  it("날짜 목록을 보낸 동안만 참이고 숨기거나 홈이 내려가면 거짓이다", () => {
    window.history.replaceState(null, "", "/home?nativeDateBar=1");
    __resetNativeDateBarForTests();
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });

    const { result, rerender, unmount } = renderHook(({ hidden }) => useBoth(hidden), {
      initialProps: { hidden: false },
    });
    expect(result.current).toBe(true);
    rerender({ hidden: true });
    expect(result.current).toBe(false);
    rerender({ hidden: false });
    expect(result.current).toBe(true);
    unmount();
    expect(renderHook(() => useNativeDateBarShown()).result.current).toBe(false);
  });

  it("날짜 줄을 그리지 않는 앱에서는 늘 거짓이다", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    const { result } = renderHook(() => useBoth(false));
    expect(result.current).toBe(false);
  });
});
