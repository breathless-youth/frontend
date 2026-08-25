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

  it("ping 메시지를 파싱한다 — 생존 확인(BY-436)", () => {
    expect(parseToWebMessage(JSON.stringify({ type: "ping", id: 3, atMs: 1000 }))).toEqual({
      type: "ping",
      id: 3,
      atMs: 1000,
    });
  });

  it("ping의 id가 number가 아니면 null이다 — 짝을 맞출 수 없는 응답이 나간다", () => {
    expect(parseToWebMessage(JSON.stringify({ type: "ping", id: "3", atMs: 1000 }))).toBeNull();
  });

  it("알 수 없는 type은 null을 돌려준다 — 앱 버전이 앞서갈 때 죽지 않아야 한다", () => {
    expect(parseToWebMessage('{"type":"future-message","atMs":1}')).toBeNull();
  });

  it("camera-permission을 파싱한다", () => {
    expect(parseToWebMessage('{"type":"camera-permission","granted":true,"atMs":3000}')).toEqual({
      type: "camera-permission",
      granted: true,
      atMs: 3000,
    });
  });

  it("camera-permission의 granted가 boolean이 아니면 null이다 — 모름을 허용으로 읽으면 안 된다", () => {
    expect(parseToWebMessage('{"type":"camera-permission","granted":"yes","atMs":1}')).toBeNull();
  });

  it("JSON이 아니면 null을 돌려준다", () => {
    expect(parseToWebMessage("not json")).toBeNull();
  });

  it("필드 타입이 어긋나면 null을 돌려준다", () => {
    expect(parseToWebMessage('{"type":"device-handling","active":"yes","atMs":1}')).toBeNull();
  });

  it("성공한 submit-result를 파싱한다", () => {
    expect(
      parseToWebMessage(
        '{"type":"submit-result","requestId":"submit-1","ok":true,"sessions":[{"id":7}],"atMs":3000}',
      ),
    ).toEqual({
      type: "submit-result",
      requestId: "submit-1",
      ok: true,
      sessions: [{ id: 7 }],
      atMs: 3000,
    });
  });

  it("실패한 submit-result를 파싱한다 — 사유가 사용자에게 보여야 한다", () => {
    expect(
      parseToWebMessage(
        '{"type":"submit-result","requestId":"submit-2","ok":false,"message":"저장 실패","atMs":4000}',
      ),
    ).toEqual({
      type: "submit-result",
      requestId: "submit-2",
      ok: false,
      message: "저장 실패",
      atMs: 4000,
    });
  });

  it("ok=true인데 sessions가 없으면 null이다 — 빈 성공으로 오해하면 안 된다", () => {
    expect(
      parseToWebMessage('{"type":"submit-result","requestId":"submit-3","ok":true,"atMs":1}'),
    ).toBeNull();
  });

  it("ok=false인데 message가 없으면 null이다", () => {
    expect(
      parseToWebMessage('{"type":"submit-result","requestId":"submit-4","ok":false,"atMs":1}'),
    ).toBeNull();
  });

  it("requestId가 없으면 null이다 — 짝을 맞출 수 없는 응답은 버린다", () => {
    expect(
      parseToWebMessage('{"type":"submit-result","ok":true,"sessions":[],"atMs":1}'),
    ).toBeNull();
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

  /**
   * 회귀 가드. 존재 검사(`typeof postMessage === "function"`)는 통과하는데 **호출이 던지는**
   * 조합이 실제로 존재한다 — iOS에서 웹뷰가 파괴되는 중이면 껍데기만 남고 그 안의
   * `window.webkit.messageHandlers`가 사라진다(2026-08-05 실기기, FOCUSMAKERS-WEB-1·2).
   */
  it("postMessage가 던져도 삼킨다 — 웹뷰 파괴 중 호출", () => {
    vi.stubGlobal("ReactNativeWebView", {
      postMessage: () => {
        throw new TypeError(
          "undefined is not an object (evaluating 'window.webkit.messageHandlers')",
        );
      },
    });

    expect(() => postToNative({ type: "session-ready", atMs: 42 })).not.toThrow();
    vi.unstubAllGlobals();
  });
});
