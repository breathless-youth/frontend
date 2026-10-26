import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useNativeOrientationUnlock } from "@/lib/nativeBackGesture";

const postMessage = vi.fn();

beforeEach(() => {
  vi.stubGlobal("ReactNativeWebView", { postMessage });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  postMessage.mockClear();
});

it("마운트에 unlocked true, 언마운트에 false를 보낸다", () => {
  const { unmount } = renderHook(() => useNativeOrientationUnlock());
  expect(JSON.parse(postMessage.mock.calls[0][0] as string)).toMatchObject({
    type: "set-orientation",
    unlocked: true,
  });

  unmount();
  expect(JSON.parse(postMessage.mock.calls[1][0] as string)).toMatchObject({
    type: "set-orientation",
    unlocked: false,
  });
});

it("화면이 다시 보이거나 크기가 바뀌면 회전 해제를 다시 보낸다", () => {
  const { unmount } = renderHook(() => useNativeOrientationUnlock());
  postMessage.mockClear();

  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("resize"));

  expect(postMessage.mock.calls.map(([raw]) => JSON.parse(raw as string))).toEqual([
    expect.objectContaining({ type: "set-orientation", unlocked: true }),
    expect.objectContaining({ type: "set-orientation", unlocked: true }),
  ]);

  unmount();
  postMessage.mockClear();
  window.dispatchEvent(new Event("resize"));
  expect(postMessage).not.toHaveBeenCalled();
});

it("화면이 숨겨질 때는 회전 해제를 보내지 않는다", () => {
  renderHook(() => useNativeOrientationUnlock());
  postMessage.mockClear();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");

  document.dispatchEvent(new Event("visibilitychange"));

  expect(postMessage).not.toHaveBeenCalled();
});
