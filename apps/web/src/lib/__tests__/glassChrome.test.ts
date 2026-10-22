import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import {
  __resetGlassChromeForTests,
  glassChromeVersion,
  hasGlassChrome,
  registerPressHandler,
  supportsInlineKind,
  useNativeControlPressRelay,
} from "@/lib/glassChrome";

function nativeEntry(): (raw: string) => void {
  return (globalThis as unknown as Record<string, (raw: string) => void>)[NATIVE_MESSAGE_ENTRY];
}

function press(id: string, value = 0): void {
  act(() => {
    nativeEntry()(JSON.stringify({ type: "native-control-press", id, value, atMs: 1 }));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
  __resetGlassChromeForTests();
});

describe("hasGlassChrome", () => {
  it("glassChrome=1과 브리지가 함께 있을 때만 참이다", () => {
    window.history.replaceState(null, "", "/terms?glassChrome=1");
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    __resetGlassChromeForTests();

    expect(hasGlassChrome()).toBe(true);
  });

  it("표시가 없으면 브리지가 있어도 거짓이다", () => {
    window.history.replaceState(null, "", "/terms");
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    __resetGlassChromeForTests();

    expect(hasGlassChrome()).toBe(false);
  });

  it("브리지가 없으면 표시가 있어도 거짓이다", () => {
    window.history.replaceState(null, "", "/terms?glassChrome=1");
    __resetGlassChromeForTests();

    expect(hasGlassChrome()).toBe(false);
  });

  it("처음 읽은 뒤 쿼리가 사라져도 판정이 유지된다", () => {
    window.history.replaceState(null, "", "/terms?glassChrome=1");
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    __resetGlassChromeForTests();
    expect(hasGlassChrome()).toBe(true);

    window.history.replaceState(null, "", "/terms");

    expect(hasGlassChrome()).toBe(true);
  });
});

describe("glassChromeVersion", () => {
  it.each([
    ["1", 1],
    ["2", 2],
    ["x", 0],
    ["0", 0],
  ])("glassChrome=%s이면 %i이다", (value, version) => {
    window.history.replaceState(null, "", `/terms?glassChrome=${value}`);
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    __resetGlassChromeForTests();

    expect(glassChromeVersion()).toBe(version);
  });

  it("표시가 없으면 0이다", () => {
    window.history.replaceState(null, "", "/terms");
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    __resetGlassChromeForTests();

    expect(glassChromeVersion()).toBe(0);
  });

  it("브리지가 없으면 표시가 있어도 0이다", () => {
    window.history.replaceState(null, "", "/terms?glassChrome=2");
    __resetGlassChromeForTests();

    expect(glassChromeVersion()).toBe(0);
  });

  it("버전 2인 앱에서도 hasGlassChrome은 참이다", () => {
    window.history.replaceState(null, "", "/terms?glassChrome=2");
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    __resetGlassChromeForTests();

    expect(hasGlassChrome()).toBe(true);
  });
});

describe("supportsInlineKind", () => {
  it("glassControls 목록에 있는 종류만 참이다", () => {
    window.history.replaceState(null, "", "/records?glassChrome=1&glassControls=segment,switch");
    __resetGlassChromeForTests();

    expect(supportsInlineKind("segment")).toBe(true);
    expect(supportsInlineKind("switch")).toBe(true);
    expect(supportsInlineKind("button")).toBe(false);
  });

  it("목록이 없으면 어떤 종류도 거짓이다", () => {
    window.history.replaceState(null, "", "/records?glassChrome=1");
    __resetGlassChromeForTests();

    expect(supportsInlineKind("segment")).toBe(false);
    expect(supportsInlineKind("button")).toBe(false);
  });

  it("처음 읽은 뒤 쿼리가 사라져도 목록이 유지된다", () => {
    window.history.replaceState(null, "", "/records?glassControls=button");
    __resetGlassChromeForTests();
    expect(supportsInlineKind("button")).toBe(true);

    window.history.replaceState(null, "", "/records");

    expect(supportsInlineKind("button")).toBe(true);
  });
});

describe("registerPressHandler + useNativeControlPressRelay", () => {
  it("native-control-press를 등록한 처리기에 value와 함께 넘긴다", () => {
    renderHook(() => {
      useNativeControlPressRelay();
    });
    const handler = vi.fn();
    const unregister = registerPressHandler("records-period", handler);

    press("records-period", 1);

    expect(handler).toHaveBeenCalledWith(1);
    unregister();
  });

  it("등록을 풀면 더는 부르지 않는다", () => {
    renderHook(() => {
      useNativeControlPressRelay();
    });
    const handler = vi.fn();
    registerPressHandler("chrome:leading", handler)();

    press("chrome:leading");

    expect(handler).not.toHaveBeenCalled();
  });

  it("모르는 id는 무시한다", () => {
    renderHook(() => {
      useNativeControlPressRelay();
    });
    const handler = vi.fn();
    const unregister = registerPressHandler("chrome:leading", handler);

    press("records-period");

    expect(handler).not.toHaveBeenCalled();
    unregister();
  });

  it("같은 id는 마지막 등록이 받고, 앞선 등록의 해제가 뒤의 등록을 풀지 않는다", () => {
    renderHook(() => {
      useNativeControlPressRelay();
    });
    const first = vi.fn();
    const second = vi.fn();
    const unregisterFirst = registerPressHandler("chrome:leading", first);
    const unregisterSecond = registerPressHandler("chrome:leading", second);

    unregisterFirst();
    press("chrome:leading");

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(0);
    unregisterSecond();
  });
});
