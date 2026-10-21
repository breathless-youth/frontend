import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useLandscapeLayout } from "../useLandscapeLayout";

function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const media = {
    get matches() {
      return matches;
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  const matchMedia = vi.fn(() => media);
  vi.stubGlobal("matchMedia", matchMedia);
  return {
    matchMedia,
    set(next: boolean) {
      matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("useLandscapeLayout", () => {
  it("matchMedia가 없으면 세로다", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useLandscapeLayout(true));
    expect(result.current).toBe(false);
  });

  it("꺼져 있으면 matchMedia를 부르지 않는다", () => {
    const media = stubMatchMedia(true);
    const { result } = renderHook(() => useLandscapeLayout(false));
    expect(result.current).toBe(false);
    expect(media.matchMedia).not.toHaveBeenCalled();
  });

  it("꺼진 뒤에는 마지막 판정을 유지한다 — 닫히며 밀려 나가는 페이지가 세로 구조로 바뀌지 않게", () => {
    stubMatchMedia(true);
    const { result, rerender } = renderHook(({ enabled }) => useLandscapeLayout(enabled), {
      initialProps: { enabled: true },
    });
    expect(result.current).toBe(true);
    rerender({ enabled: false });
    expect(result.current).toBe(true);
  });

  it("가로 미디어쿼리를 따라가고 바뀌면 다시 그린다", () => {
    const media = stubMatchMedia(true);
    const { result } = renderHook(() => useLandscapeLayout(true));
    expect(result.current).toBe(true);
    act(() => media.set(false));
    expect(result.current).toBe(false);
  });

  it("텍스트 입력 중에 온 변화는 포커스가 빠진 뒤에 반영한다", async () => {
    const media = stubMatchMedia(false);
    const input = document.body.appendChild(document.createElement("input"));
    const { result } = renderHook(() => useLandscapeLayout(true));
    input.focus();
    act(() => media.set(true));
    expect(result.current).toBe(false);
    await act(async () => {
      input.blur();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current).toBe(true);
  });

  it("focusout 때 포커스가 아직 입력 요소에 있어도 옮겨 간 뒤 다시 판정한다", async () => {
    const media = stubMatchMedia(false);
    const input = document.body.appendChild(document.createElement("input"));
    const { result } = renderHook(() => useLandscapeLayout(true));
    input.focus();
    act(() => media.set(true));
    await act(async () => {
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      input.remove();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current).toBe(true);
  });

  it("슬라이더에 포커스가 있어도 변화를 반영한다", () => {
    const media = stubMatchMedia(false);
    const slider = document.body.appendChild(document.createElement("input"));
    slider.type = "range";
    const { result } = renderHook(() => useLandscapeLayout(true));
    slider.focus();
    act(() => media.set(true));
    expect(result.current).toBe(true);
  });
});
