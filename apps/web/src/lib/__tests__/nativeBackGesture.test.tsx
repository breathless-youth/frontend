import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useNativeBackGestureLock } from "../nativeBackGesture";

function Lock({ released }: { released?: boolean }) {
  useNativeBackGestureLock(released);
  return null;
}

function stubBridge() {
  const postMessage = vi.fn();
  vi.stubGlobal("ReactNativeWebView", { postMessage });
  return () =>
    postMessage.mock.calls
      .map(([raw]) => JSON.parse(raw as string) as { type: string; enabled?: boolean })
      .filter((message) => message.type === "set-back-gesture")
      .map((message) => message.enabled);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useNativeBackGestureLock", () => {
  it("마운트 동안 끄고 언마운트에서 켠다", () => {
    const sent = stubBridge();
    const { unmount } = render(<Lock />);
    expect(sent()).toEqual([false]);
    unmount();
    expect(sent()).toEqual([false, true]);
  });

  it("푸는 동안만 켜고 다시 잠그면 끈다", () => {
    const sent = stubBridge();
    const { rerender } = render(<Lock released={false} />);
    rerender(<Lock released />);
    rerender(<Lock released={false} />);
    expect(sent()).toEqual([false, true, false]);
  });

  it("푼 채로 언마운트해도 마지막 신호는 켜짐 하나다", () => {
    const sent = stubBridge();
    const { rerender, unmount } = render(<Lock released={false} />);
    rerender(<Lock released />);
    unmount();
    expect(sent()).toEqual([false, true, true]);
  });
});
