import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useRegularWindow } from "../useRegularWindow";

function stubMedia(matches: Record<string, boolean>) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: matches[query] ?? false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

/** 조건을 바꾸고 change를 흘려 넣을 수 있는 matchMedia 대역 */
function stubLiveMedia(initial: Record<string, boolean>) {
  const matches = { ...initial };
  // 쿼리마다 따로 모아야 한쪽만 떼고 다른 쪽을 남기는 실수를 잡는다.
  const listeners = new Map<string, Set<() => void>>();
  const listenersOf = (query: string) => {
    if (!listeners.has(query)) listeners.set(query, new Set());
    return listeners.get(query)!;
  };
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return matches[query] ?? false;
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => listenersOf(query).add(listener),
    removeEventListener: (_type: string, listener: () => void) =>
      listenersOf(query).delete(listener),
  }));
  return {
    listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    change(query: string, value: boolean) {
      matches[query] = value;
      for (const listener of [...listenersOf(query)]) listener();
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("useRegularWindow", () => {
  it("matchMedia가 없으면 false다", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(renderHook(() => useRegularWindow()).result.current).toBe(false);
  });
  it("폭 600 이상이고 가로 폰이 아니면 true다", () => {
    stubMedia({ "(min-width: 37.5rem)": true });
    expect(renderHook(() => useRegularWindow()).result.current).toBe(true);
  });
  it("가로로 눕힌 폰은 폭이 넓어도 false다", () => {
    stubMedia({
      "(min-width: 37.5rem)": true,
      "(orientation: landscape) and (max-height: 29.99rem)": true,
    });
    expect(renderHook(() => useRegularWindow()).result.current).toBe(false);
  });
  it("폭 600 미만은 false다", () => {
    stubMedia({});
    expect(renderHook(() => useRegularWindow()).result.current).toBe(false);
  });
  it("창 조건이 바뀌면 판정을 다시 읽는다", () => {
    const media = stubLiveMedia({ "(min-width: 37.5rem)": true });
    const { result } = renderHook(() => useRegularWindow());
    expect(result.current).toBe(true);

    act(() => media.change("(orientation: landscape) and (max-height: 29.99rem)", true));
    expect(result.current).toBe(false);

    act(() => media.change("(orientation: landscape) and (max-height: 29.99rem)", false));
    expect(result.current).toBe(true);
  });
  it("언마운트하면 붙인 리스너를 모두 뗀다", () => {
    const media = stubLiveMedia({ "(min-width: 37.5rem)": true });
    const { unmount } = renderHook(() => useRegularWindow());
    expect(media.listenerCount()).toBe(2);

    unmount();

    expect(media.listenerCount()).toBe(0);
  });
});
