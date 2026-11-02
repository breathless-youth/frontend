import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useKeyboardInset } from "../useKeyboardInset";

function fakeViewport(height: number, offsetTop = 0) {
  const target = new EventTarget() as EventTarget & { height: number; offsetTop: number };
  target.height = height;
  target.offsetTop = offsetTop;
  vi.stubGlobal("visualViewport", target);
  vi.stubGlobal("innerHeight", 874);
  return target;
}

afterEach(() => vi.unstubAllGlobals());

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
});
