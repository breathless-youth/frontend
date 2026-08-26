import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useNativeOrientationUnlock } from "@/lib/nativeBackGesture";

const postMessage = vi.fn();

beforeEach(() => {
  vi.stubGlobal("ReactNativeWebView", { postMessage });
});

afterEach(() => {
  vi.unstubAllGlobals();
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
