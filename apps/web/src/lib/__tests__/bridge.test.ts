import { describe, expect, it, vi } from "vitest";

import { parseToWebMessage, postToNative, subscribeToNativeMessages } from "@/lib/bridge";

describe("parseToWebMessage", () => {
  it("device-handling 메시지를 파싱한다", () => {
    expect(parseToWebMessage('{"type":"device-handling","active":true,"atMs":1000}')).toEqual({
      type: "device-handling",
      active: true,
      atMs: 1000,
    });
  });

  it("알 수 없는 type은 null을 돌려준다 — 앱 버전이 앞서갈 때 죽지 않아야 한다", () => {
    expect(parseToWebMessage('{"type":"future-message","atMs":1}')).toBeNull();
  });

  it("지운 메시지(app-state·ping)는 모르는 메시지로 버린다 — 구버전 앱이 보내도 죽지 않는다", () => {
    expect(parseToWebMessage('{"type":"app-state","state":"active","atMs":1}')).toBeNull();
    expect(parseToWebMessage('{"type":"ping","id":1,"atMs":1}')).toBeNull();
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

  it("session-closed를 파싱한다", () => {
    expect(parseToWebMessage('{"type":"session-closed","atMs":1}')).toEqual({
      type: "session-closed",
      atMs: 1,
    });
  });

  it("session-closed에 atMs가 없으면 null을 돌려준다", () => {
    expect(parseToWebMessage('{"type":"session-closed"}')).toBeNull();
  });

  it("tab-focus는 focused가 boolean일 때만 받는다", () => {
    expect(parseToWebMessage('{"type":"tab-focus","focused":false,"atMs":3}')).toEqual({
      type: "tab-focus",
      focused: false,
      atMs: 3,
    });
    expect(parseToWebMessage('{"type":"tab-focus","focused":"no","atMs":3}')).toBeNull();
  });

  it("home-play-pressed를 파싱한다", () => {
    expect(parseToWebMessage('{"type":"home-play-pressed","atMs":4}')).toEqual({
      type: "home-play-pressed",
      atMs: 4,
    });
  });

  it("session-invite를 파싱한다", () => {
    expect(parseToWebMessage('{"type":"session-invite","code":"4680","atMs":1}')).toEqual({
      type: "session-invite",
      code: "4680",
      atMs: 1,
    });
  });

  it("session-invite의 code가 문자열이 아니면 null을 돌려준다", () => {
    expect(parseToWebMessage('{"type":"session-invite","code":4680,"atMs":1}')).toBeNull();
  });

  it("auth-token을 파싱한다", () => {
    expect(
      parseToWebMessage('{"type":"auth-token","userId":7,"accessToken":"a1","atMs":1}'),
    ).toEqual({
      type: "auth-token",
      userId: 7,
      accessToken: "a1",
      atMs: 1,
    });
  });

  it("auth-token은 userId·accessToken null을 허용한다 — 등록 실패·토큰 없는 서버", () => {
    expect(
      parseToWebMessage('{"type":"auth-token","userId":null,"accessToken":null,"atMs":1}'),
    ).toEqual({ type: "auth-token", userId: null, accessToken: null, atMs: 1 });
  });

  it.each([
    '{"type":"auth-token","userId":"7","accessToken":"a1","atMs":1}',
    '{"type":"auth-token","userId":7,"atMs":1}',
    '{"type":"auth-token","userId":7,"accessToken":"a1"}',
  ])("auth-token의 필드가 어긋나면 null이다 — %s", (raw) => {
    expect(parseToWebMessage(raw)).toBeNull();
  });
});

describe("parseToWebMessage: 방해 앱 잠금", () => {
  const state = {
    type: "app-lock-state",
    id: "request-1",
    supported: true,
    authorized: true,
    revoked: false,
    appCount: 3,
    categoryCount: 1,
    atMs: 1,
  };

  it("app-lock-state를 파싱한다", () => {
    expect(parseToWebMessage(JSON.stringify(state))).toEqual(state);
  });

  it.each([undefined, "", 1])("app-lock-state의 요청 id가 %j이면 버린다", (id) => {
    expect(parseToWebMessage(JSON.stringify({ ...state, id }))).toBeNull();
  });

  it.each(["supported", "authorized", "revoked", "appCount", "categoryCount"])(
    "app-lock-state의 %s 타입이 틀리면 버린다",
    (key) => {
      expect(parseToWebMessage(JSON.stringify({ ...state, [key]: "1" }))).toBeNull();
    },
  );

  it.each([
    ["appCount", -1],
    ["appCount", 1.5],
    ["categoryCount", -1],
    ["categoryCount", 0.5],
  ])("개수 %s가 음이 아닌 정수가 아니면(%s) 버린다", (key, value) => {
    const started = { type: "app-lock-started", appCount: 2, categoryCount: 0, atMs: 1 };
    expect(parseToWebMessage(JSON.stringify({ ...state, [key]: value }))).toBeNull();
    expect(parseToWebMessage(JSON.stringify({ ...started, [key]: value }))).toBeNull();
  });

  it("app-lock-started를 파싱한다", () => {
    const started = { type: "app-lock-started", appCount: 2, categoryCount: 0, atMs: 1 };
    expect(parseToWebMessage(JSON.stringify(started))).toEqual(started);
    expect(parseToWebMessage(JSON.stringify({ ...started, appCount: null }))).toBeNull();
  });
});

describe("parseToWebMessage: video-result", () => {
  const ID = "0b6f3f4e-7c1d-4f6a-9a51-3d2b1c0e9f87";

  it.each(["saved", "shared", "dismissed", "denied", "failed"])(
    "status %s를 파싱한다",
    (status) => {
      expect(
        parseToWebMessage(
          JSON.stringify({ type: "video-result", id: ID, action: "save", status, atMs: 1 }),
        ),
      ).toEqual({ type: "video-result", id: ID, action: "save", status, atMs: 1 });
    },
  );

  it.each([
    { type: "video-result", id: ID, action: "save", status: "unknown", atMs: 1 },
    { type: "video-result", id: ID, action: "upload", status: "saved", atMs: 1 },
    { type: "video-result", id: 1, action: "share", status: "shared", atMs: 1 },
    { type: "video-result", action: "share", status: "shared", atMs: 1 },
    { type: "video-result", id: ID, action: "share", status: "shared" },
  ])("필드가 빠지거나 목록 밖 값이면 버린다: %o", (message) => {
    expect(parseToWebMessage(JSON.stringify(message))).toBeNull();
  });
});

describe("parseToWebMessage: profile-photo-result", () => {
  const parse = (message: Record<string, unknown>) => parseToWebMessage(JSON.stringify(message));

  it("picked는 사진 본문과 함께 파싱한다", () => {
    expect(
      parse({ type: "profile-photo-result", id: "r1", status: "picked", data: "AAEC", atMs: 1 }),
    ).toEqual({ type: "profile-photo-result", id: "r1", status: "picked", data: "AAEC", atMs: 1 });
  });

  it("picked는 본문이 비어도 파싱해 기다리는 쪽에 넘긴다", () => {
    expect(
      parse({ type: "profile-photo-result", id: "r1", status: "picked", data: "", atMs: 1 }),
    ).toEqual({ type: "profile-photo-result", id: "r1", status: "picked", data: "", atMs: 1 });
  });

  it.each(["cancelled", "failed"])("%s는 본문 없이 파싱한다", (status) => {
    expect(
      parse({ type: "profile-photo-result", id: "r1", status, data: "AAEC", atMs: 1 }),
    ).toEqual({ type: "profile-photo-result", id: "r1", status, atMs: 1 });
  });

  it.each([
    { type: "profile-photo-result", id: "r1", status: "picked", atMs: 1 },
    { type: "profile-photo-result", id: "r1", status: "picked", data: 1, atMs: 1 },
    { type: "profile-photo-result", id: "r1", status: "unknown", atMs: 1 },
    { type: "profile-photo-result", id: "", status: "cancelled", atMs: 1 },
    { type: "profile-photo-result", status: "cancelled", atMs: 1 },
    { type: "profile-photo-result", id: "r1", status: "cancelled" },
  ])("모양이 틀리면 버린다: %o", (message) => {
    expect(parse(message)).toBeNull();
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

describe("parseToWebMessage: native-control-press", () => {
  const press = { type: "native-control-press", id: "chrome:leading", value: 0, atMs: 1 };

  it("누름을 파싱한다", () => {
    expect(parseToWebMessage(JSON.stringify(press))).toEqual(press);
    expect(parseToWebMessage(JSON.stringify({ ...press, id: "records:range", value: 2 }))).toEqual({
      ...press,
      id: "records:range",
      value: 2,
    });
  });

  it.each([
    ["value가 정수가 아님", { ...press, value: 1.5 }],
    ["value가 문자열", { ...press, value: "1" }],
    ["id에 대문자", { ...press, id: "A" }],
    ["id가 빈 문자열", { ...press, id: "" }],
    ["id가 65자", { ...press, id: "a".repeat(65) }],
  ])("%s이면 버린다", (_, message) => {
    expect(parseToWebMessage(JSON.stringify(message))).toBeNull();
  });
});

describe("postToNative", () => {
  it("ReactNativeWebView가 있으면 직렬화해 보내고 true를 돌려준다", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    expect(postToNative({ type: "home-ready", atMs: 42 })).toBe(true);

    expect(postMessage).toHaveBeenCalledWith('{"type":"home-ready","atMs":42}');
    vi.unstubAllGlobals();
  });

  it("브라우저 단독 모드에서는 아무 일도 하지 않고 false를 돌려준다", () => {
    expect(postToNative({ type: "home-ready", atMs: 42 })).toBe(false);
  });

  /**
   * 회귀 가드. 존재 검사(`typeof postMessage === "function"`)는 통과하는데 **호출이 던지는**
   * 조합이 실제로 존재한다 — iOS에서 웹뷰가 파괴되는 중이면 껍데기만 남고 그 안의
   * `window.webkit.messageHandlers`가 사라진다(2026-08-05 실기기, FOCUSMAKERS-WEB-1·2).
   */
  it("postMessage가 던져도 삼키고 false를 돌려준다 — 웹뷰 파괴 중 호출", () => {
    vi.stubGlobal("ReactNativeWebView", {
      postMessage: () => {
        throw new TypeError(
          "undefined is not an object (evaluating 'window.webkit.messageHandlers')",
        );
      },
    });

    expect(postToNative({ type: "home-ready", atMs: 42 })).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("개발 로그", () => {
  it("전역 수신 함수가 버린 원문을 개발 빌드에서 찍는다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unsub = subscribeToNativeMessages(() => {});

    (window as unknown as Record<string, (raw: string) => void>).__focusonNativeMessage(
      '{"type":"nope","atMs":1}',
    );

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[webview-bridge]"),
      '{"type":"nope","atMs":1}',
    );
    warn.mockRestore();
    unsub();
  });

  it("postToNative가 나가는 메시지를 개발 빌드에서 찍는다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });

    postToNative({ type: "home-ready", atMs: 1 });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[webview-bridge]"),
      expect.objectContaining({ type: "home-ready" }),
    );
    warn.mockRestore();
    vi.unstubAllGlobals();
  });

  it("video-chunk는 성공·실패 로그 모두 조각 본문 대신 길이만 찍는다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const chunk = { type: "video-chunk", id: "id", seq: 0, data: "AAEC", atMs: 1 } as const;
    const masked = { ...chunk, data: "<4 chars>" };

    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    postToNative(chunk);
    expect(warn).toHaveBeenLastCalledWith(expect.stringContaining("[webview-bridge]"), masked);

    vi.stubGlobal("ReactNativeWebView", {
      postMessage: () => {
        throw new TypeError("gone");
      },
    });
    postToNative(chunk);
    expect(warn).toHaveBeenLastCalledWith(
      expect.stringContaining("[webview-bridge]"),
      masked,
      expect.any(TypeError),
    );

    warn.mockRestore();
    vi.unstubAllGlobals();
  });

  it("profile-updated는 앱에는 그대로 보내고 로그에서는 목표 문구와 닉네임을 가린다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    const message = {
      type: "profile-updated",
      goal: "하루 6시간",
      nickname: "포메",
      atMs: 1,
    } as const;

    postToNative(message);
    postToNative({ ...message, goal: null });

    expect(postMessage).toHaveBeenNthCalledWith(1, JSON.stringify(message));
    expect(warn).toHaveBeenNthCalledWith(1, expect.stringContaining("[webview-bridge]"), {
      ...message,
      goal: "<masked>",
      nickname: "<masked>",
    });
    expect(warn).toHaveBeenNthCalledWith(2, expect.stringContaining("[webview-bridge]"), {
      ...message,
      goal: null,
      nickname: "<masked>",
    });

    warn.mockRestore();
    vi.unstubAllGlobals();
  });

  it("운영 빌드에서는 전역 수신 함수가 버린 원문을 찍지 않는다", () => {
    const original = import.meta.env.DEV;
    (import.meta.env as unknown as { DEV: boolean }).DEV = false;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const unsub = subscribeToNativeMessages(() => {});
      (window as unknown as Record<string, (raw: string) => void>).__focusonNativeMessage(
        '{"type":"nope","atMs":1}',
      );
      expect(warn).not.toHaveBeenCalled();
      unsub();
    } finally {
      (import.meta.env as unknown as { DEV: boolean }).DEV = original;
      warn.mockRestore();
    }
  });

  it("운영 빌드에서는 postToNative가 나가는 메시지를 찍지 않는다", () => {
    const original = import.meta.env.DEV;
    (import.meta.env as unknown as { DEV: boolean }).DEV = false;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    try {
      postToNative({ type: "home-ready", atMs: 1 });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      (import.meta.env as unknown as { DEV: boolean }).DEV = original;
      warn.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("postMessage가 throw하면 개발 빌드에서 성공 로그 대신 전송 실패 로그를 찍는다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const thrown = new TypeError(
      "undefined is not an object (evaluating 'window.webkit.messageHandlers')",
    );
    vi.stubGlobal("ReactNativeWebView", {
      postMessage: () => {
        throw thrown;
      },
    });

    postToNative({ type: "home-ready", atMs: 1 });

    expect(warn).not.toHaveBeenCalledWith(
      "[webview-bridge] 네이티브로 보냄",
      expect.objectContaining({ type: "home-ready" }),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[webview-bridge]"),
      expect.objectContaining({ type: "home-ready" }),
      thrown,
    );
    warn.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe("parseToWebMessage: 앱 홈 날짜 줄", () => {
  it("날짜 누름을 파싱한다", () => {
    expect(
      parseToWebMessage('{"type":"home-date-selected","dateKey":"2026-10-28","atMs":1}'),
    ).toEqual({ type: "home-date-selected", dateKey: "2026-10-28", atMs: 1 });
  });

  it("메뉴 항목은 목록에 있는 값만 받는다", () => {
    expect(
      parseToWebMessage('{"type":"home-menu-action","action":"edit-subjects","atMs":1}'),
    ).toEqual({ type: "home-menu-action", action: "edit-subjects", atMs: 1 });
    expect(
      parseToWebMessage('{"type":"home-menu-action","action":"delete-all","atMs":1}'),
    ).toBeNull();
  });
});

describe("parseToWebMessage — install-attribution(설치 유입 정보)", () => {
  const valid = {
    type: "install-attribution",
    platform: "android",
    installReferrer: "utm_source=apps.facebook.com&utm_content=%7B%7D",
    deepLinkAd: "aos_v3",
    capturedAtMs: 5,
    atMs: 9,
  };

  it("앱이 읽은 값을 그대로 파싱한다", () => {
    expect(parseToWebMessage(JSON.stringify(valid))).toEqual(valid);
  });

  it("값이 없는 항목은 null로 받는다", () => {
    const empty = { ...valid, platform: "ios", installReferrer: null, deepLinkAd: null };
    expect(parseToWebMessage(JSON.stringify(empty))).toEqual(empty);
  });

  it("플랫폼이나 읽은 시각이 이상하면 통째로 버린다", () => {
    expect(parseToWebMessage(JSON.stringify({ ...valid, platform: "web" }))).toBeNull();
    expect(parseToWebMessage(JSON.stringify({ ...valid, capturedAtMs: "5" }))).toBeNull();
    expect(parseToWebMessage(JSON.stringify({ ...valid, installReferrer: 1 }))).toBeNull();
  });

  it("형식 밖 광고 번호와 너무 긴 설치 정보는 그 항목만 비운다", () => {
    expect(
      parseToWebMessage(
        JSON.stringify({ ...valid, deepLinkAd: "web_v1", installReferrer: "a".repeat(5000) }),
      ),
    ).toEqual({ ...valid, deepLinkAd: null, installReferrer: null });
  });
});
