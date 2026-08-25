import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { useNativePingResponder } from "@/lib/nativeLiveness";

function Harness() {
  useNativePingResponder();
  return null;
}

type Entry = ((raw: string) => void) | undefined;

function nativeEntry(): Entry {
  return (globalThis as unknown as Record<string, Entry>)[NATIVE_MESSAGE_ENTRY];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useNativePingResponder", () => {
  it("ping을 받으면 같은 id로 pong을 즉답한다 — 웹뷰 생존 확인(BY-436)", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    render(<Harness />);
    nativeEntry()?.(JSON.stringify({ type: "ping", id: 7, atMs: 1000 }));

    expect(postMessage).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(postMessage.mock.calls[0]![0] as string) as {
      type: string;
      id: number;
    };
    expect(sent.type).toBe("pong");
    expect(sent.id).toBe(7);
  });

  it("언마운트 후에는 응답하지 않는다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    const { unmount } = render(<Harness />);
    unmount();
    nativeEntry()?.(JSON.stringify({ type: "ping", id: 8, atMs: 1000 }));

    expect(postMessage).not.toHaveBeenCalled();
  });
});
