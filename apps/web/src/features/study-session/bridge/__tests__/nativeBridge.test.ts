import { describe, expect, it, vi } from "vitest";

import { parseToWebMessage, postToNative } from "@/lib/bridge";

describe("parseToWebMessage", () => {
  it("device-handling 메시지를 파싱한다", () => {
    expect(parseToWebMessage('{"type":"device-handling","active":true,"atMs":1000}')).toEqual({
      type: "device-handling",
      active: true,
      atMs: 1000,
    });
  });

  it("app-state 메시지를 파싱한다", () => {
    expect(parseToWebMessage('{"type":"app-state","state":"background","atMs":2000}')).toEqual({
      type: "app-state",
      state: "background",
      atMs: 2000,
    });
  });

  it("알 수 없는 type은 null을 돌려준다 — 앱 버전이 앞서갈 때 죽지 않아야 한다", () => {
    expect(parseToWebMessage('{"type":"future-message","atMs":1}')).toBeNull();
  });

  it("JSON이 아니면 null을 돌려준다", () => {
    expect(parseToWebMessage("not json")).toBeNull();
  });

  it("필드 타입이 어긋나면 null을 돌려준다", () => {
    expect(parseToWebMessage('{"type":"device-handling","active":"yes","atMs":1}')).toBeNull();
  });
});

describe("postToNative", () => {
  it("ReactNativeWebView가 있으면 직렬화해 보낸다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    postToNative({ type: "session-ready", atMs: 42 });

    expect(postMessage).toHaveBeenCalledWith('{"type":"session-ready","atMs":42}');
    vi.unstubAllGlobals();
  });

  it("브라우저 단독 모드에서는 아무 일도 하지 않는다", () => {
    expect(() => postToNative({ type: "session-ready", atMs: 42 })).not.toThrow();
  });
});
