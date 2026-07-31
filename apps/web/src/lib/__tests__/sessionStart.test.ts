import { afterEach, describe, expect, it, vi } from "vitest";

import { requestSessionStart } from "../sessionStart";

/** 웹뷰 안에서는 브리지로, 브라우저 단독 모드에서는 직접 이동으로 갈린다 (BY-334). */

const globalWithBridge = globalThis as { ReactNativeWebView?: { postMessage(m: string): void } };

afterEach(() => {
  delete globalWithBridge.ReactNativeWebView;
});

describe("requestSessionStart", () => {
  it("네이티브 웹뷰에서는 start-session을 보내고 직접 이동하지 않는다", () => {
    const postMessage = vi.fn();
    globalWithBridge.ReactNativeWebView = { postMessage };
    const navigateToSession = vi.fn();

    const route = requestSessionStart(navigateToSession);

    expect(navigateToSession).not.toHaveBeenCalled();
    expect(route).toBe("native");
    expect(postMessage).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(postMessage.mock.calls[0][0] as string) as {
      type: string;
      atMs: number;
    };
    expect(sent.type).toBe("start-session");
    expect(typeof sent.atMs).toBe("number");
  });

  it("브라우저 단독 모드에서는 세션 라우트로 직접 이동한다", () => {
    const navigateToSession = vi.fn();

    const route = requestSessionStart(navigateToSession);

    expect(navigateToSession).toHaveBeenCalledTimes(1);
    expect(route).toBe("web");
  });
});
