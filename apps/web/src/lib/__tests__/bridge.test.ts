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

  it("camera-gate-result를 파싱한다", () => {
    expect(parseToWebMessage('{"type":"camera-gate-result","granted":false,"atMs":1}')).toEqual({
      type: "camera-gate-result",
      granted: false,
      atMs: 1,
    });
  });

  it("camera-gate-result의 granted가 boolean이 아니면 null을 돌려준다", () => {
    expect(parseToWebMessage('{"type":"camera-gate-result","granted":"no","atMs":1}')).toBeNull();
  });

  it("theme을 파싱한다", () => {
    expect(parseToWebMessage('{"type":"theme","scheme":"dark","atMs":1}')).toEqual({
      type: "theme",
      scheme: "dark",
      atMs: 1,
    });
  });

  it("theme의 scheme이 light/dark 밖이면 null을 돌려준다", () => {
    expect(parseToWebMessage('{"type":"theme","scheme":"sepia","atMs":1}')).toBeNull();
  });

  it("reset-route를 파싱한다", () => {
    expect(parseToWebMessage('{"type":"reset-route","path":"/settings","atMs":1}')).toEqual({
      type: "reset-route",
      path: "/settings",
      atMs: 1,
    });
  });

  it("reset-route의 path가 문자열이 아니면 null을 돌려준다", () => {
    expect(parseToWebMessage('{"type":"reset-route","path":1,"atMs":1}')).toBeNull();
  });

  it("app-launched를 파싱한다", () => {
    expect(parseToWebMessage('{"type":"app-launched","atMs":1}')).toEqual({
      type: "app-launched",
      atMs: 1,
    });
  });

  it("app-launched에 atMs가 없으면 null을 돌려준다", () => {
    expect(parseToWebMessage('{"type":"app-launched"}')).toBeNull();
  });
});

describe("parseToWebMessage — track-event(네이티브 사용자 이벤트)", () => {
  it("이름과 원시값 속성을 파싱한다", () => {
    expect(
      parseToWebMessage(
        JSON.stringify({
          type: "track-event",
          name: "tab_pressed",
          properties: { tab: "social", from_tab: "home", count: 2, ok: true, none: null },
          atMs: 1000,
        }),
      ),
    ).toEqual({
      type: "track-event",
      name: "tab_pressed",
      properties: { tab: "social", from_tab: "home", count: 2, ok: true, none: null },
      atMs: 1000,
    });
  });

  it("속성이 없어도 파싱한다 — properties 키를 만들지 않는다", () => {
    expect(
      parseToWebMessage(
        JSON.stringify({ type: "track-event", name: "permission_denied_viewed", atMs: 1 }),
      ),
    ).toEqual({ type: "track-event", name: "permission_denied_viewed", atMs: 1 });
  });

  it("이름이 snake_case 형식이 아니면 null이다 — 카탈로그 밖 모양은 받지 않는다", () => {
    expect(
      parseToWebMessage(JSON.stringify({ type: "track-event", name: "Tab Pressed", atMs: 1 })),
    ).toBeNull();
    expect(
      parseToWebMessage(JSON.stringify({ type: "track-event", name: "", atMs: 1 })),
    ).toBeNull();
    expect(parseToWebMessage(JSON.stringify({ type: "track-event", atMs: 1 }))).toBeNull();
  });

  it("객체·배열 값과 형식 밖 키는 그 항목만 버린다 — 식별자·자유 구조를 싣지 않는다", () => {
    expect(
      parseToWebMessage(
        JSON.stringify({
          type: "track-event",
          name: "tab_pressed",
          properties: { tab: "social", nested: { a: 1 }, list: [1], "Bad Key": "x" },
          atMs: 1,
        }),
      ),
    ).toEqual({ type: "track-event", name: "tab_pressed", properties: { tab: "social" }, atMs: 1 });
  });

  it("properties가 객체가 아니면 null이다", () => {
    expect(
      parseToWebMessage(
        JSON.stringify({ type: "track-event", name: "tab_pressed", properties: "x", atMs: 1 }),
      ),
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
