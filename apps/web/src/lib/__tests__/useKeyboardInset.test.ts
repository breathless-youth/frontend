import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useKeyboardInset } from "../useKeyboardInset";

const IPHONE_WEBVIEW_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID_WEBVIEW_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-A235N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36";

function fakeViewport(height: number, offsetTop = 0) {
  const target = new EventTarget() as EventTarget & { height: number; offsetTop: number };
  target.height = height;
  target.offsetTop = offsetTop;
  vi.stubGlobal("visualViewport", target);
  vi.stubGlobal("innerHeight", 874);
  return target;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useKeyboardInset", () => {
  it("가상 키보드 높이를 준다", () => {
    const viewport = fakeViewport(874);
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
    act(() => {
      viewport.height = 538;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(336);
  });

  it("키보드가 올라온 채로 보이는 영역이 밀리면 다시 측정한다", () => {
    const viewport = fakeViewport(538);
    const { result } = renderHook(() => useKeyboardInset());
    act(() => {
      viewport.offsetTop = 100;
      viewport.dispatchEvent(new Event("scroll"));
    });
    expect(result.current).toBe(236);
  });

  it("visualViewport가 없으면 0이다", () => {
    vi.stubGlobal("visualViewport", undefined);
    expect(renderHook(() => useKeyboardInset()).result.current).toBe(0);
  });

  it("보이는 영역이 더 크게 잡혀도 음수가 아니다", () => {
    fakeViewport(900);
    expect(renderHook(() => useKeyboardInset()).result.current).toBe(0);
  });

  it("iOS에서는 떠 있는 입력 보조 막대 중 보이는 영역에 들어간 높이까지 키보드로 센다", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE_WEBVIEW_UA);
    const viewport = fakeViewport(874);
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
    act(() => {
      // iPhone 17 실기기에서 보이는 영역은 531pt까지였고 입력 보조 막대는 508pt에서 시작했다.
      viewport.height = 531;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(367);
  });

  it("Android에서는 보이는 영역의 차이만 키보드로 센다", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ANDROID_WEBVIEW_UA);
    fakeViewport(538);
    expect(renderHook(() => useKeyboardInset()).result.current).toBe(336);
  });
});
