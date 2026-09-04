import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { useNativeAnalyticsRelay } from "@/lib/nativeAnalytics";

const mocks = vi.hoisted(() => ({ trackNativeShellEvent: vi.fn() }));

vi.mock("@/lib/amplitude", () => ({
  trackNativeShellEvent: mocks.trackNativeShellEvent,
}));

function Harness() {
  useNativeAnalyticsRelay();
  return null;
}

type Entry = ((raw: string) => void) | undefined;

function nativeEntry(): Entry {
  return (globalThis as unknown as Record<string, Entry>)[NATIVE_MESSAGE_ENTRY];
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useNativeAnalyticsRelay", () => {
  it("마운트하면 analytics-ready를 보낸다 — 네이티브는 이 신호를 받은 문서에만 주입한다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    render(<Harness />);

    expect(postMessage).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(postMessage.mock.calls[0]![0] as string) as { type: string };
    expect(sent.type).toBe("analytics-ready");
  });

  it("준비 신호를 보내기 전에 구독이 걸려 있다 — 신호 직후 도착한 이벤트를 놓치지 않는다", () => {
    const postMessage = vi.fn(() => {
      // 네이티브가 신호를 받자마자 큐를 비우는 상황을 흉내 낸다.
      nativeEntry()?.(
        JSON.stringify({ type: "track-event", name: "permission_denied_viewed", atMs: 7 }),
      );
    });
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    render(<Harness />);

    expect(mocks.trackNativeShellEvent).toHaveBeenCalledWith({
      type: "track-event",
      name: "permission_denied_viewed",
      atMs: 7,
    });
  });

  it("track-event를 받으면 Amplitude 전송 함수로 그대로 넘긴다", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });

    render(<Harness />);
    nativeEntry()?.(
      JSON.stringify({
        type: "track-event",
        name: "tab_pressed",
        properties: { tab: "social", from_tab: "home" },
        atMs: 1000,
      }),
    );

    expect(mocks.trackNativeShellEvent).toHaveBeenCalledTimes(1);
    expect(mocks.trackNativeShellEvent).toHaveBeenCalledWith({
      type: "track-event",
      name: "tab_pressed",
      properties: { tab: "social", from_tab: "home" },
      atMs: 1000,
    });
  });

  it("다른 메시지는 넘기지 않는다", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });

    render(<Harness />);
    nativeEntry()?.(JSON.stringify({ type: "ping", id: 1, atMs: 1 }));

    expect(mocks.trackNativeShellEvent).not.toHaveBeenCalled();
  });

  it("언마운트 후에는 넘기지 않는다", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });

    const { unmount } = render(<Harness />);
    unmount();
    nativeEntry()?.(JSON.stringify({ type: "track-event", name: "tab_pressed", atMs: 1 }));

    expect(mocks.trackNativeShellEvent).not.toHaveBeenCalled();
  });
});
