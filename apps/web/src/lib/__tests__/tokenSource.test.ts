import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isBrowserTokenSource } from "@/lib/auth/browserTokenSource";
import {
  __resetTokenSourceForTests,
  createBridgeTokenSource,
  getTokenSource,
  initTokenSource,
  logoutBrowserGuest,
} from "@/lib/auth/tokenSource";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { queryClient } from "@/lib/queryClient";

const postMessage = vi.fn();
const nativeEntry = () =>
  (globalThis as unknown as Record<string, (raw: string) => void>)[NATIVE_MESSAGE_ENTRY];
const sentTypes = () =>
  postMessage.mock.calls.map((call) => (JSON.parse(call[0] as string) as { type: string }).type);
const authToken = (accessToken: string | null, userId: number | null = 7) =>
  JSON.stringify({ type: "auth-token", userId, accessToken, atMs: 1 });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ReactNativeWebView", { postMessage });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  postMessage.mockClear();
  window.history.replaceState(null, "", "/");
});

describe("createBridgeTokenSource", () => {
  it("구독을 건 뒤 auth-ready를 보낸다 — 신호 직후 도착한 auth-token을 놓치지 않는다", async () => {
    postMessage.mockImplementationOnce(() => nativeEntry()(authToken("a1")));
    const source = createBridgeTokenSource();
    expect(sentTypes()).toEqual(["auth-ready"]);
    await expect(source.getAccessToken()).resolves.toBe("a1");
    expect(source.getCurrentToken()).toBe("a1");
    expect(source.getUserId()).toBe(7);
  });

  it("첫 토큰이 3초 안에 안 오면 null이고, 늦게 온 토큰은 다음 요청부터 쓴다", async () => {
    const source = createBridgeTokenSource();
    const pending = source.getAccessToken();
    vi.advanceTimersByTime(3000);
    await expect(pending).resolves.toBeNull();
    nativeEntry()(authToken("a1"));
    await expect(source.getAccessToken()).resolves.toBe("a1");
  });

  it("첫 auth-token 전에는 hasSettled가 false다 — null을 신원 없음으로 단정하면 안 되는 구간", () => {
    const source = createBridgeTokenSource();
    expect(source.hasSettled()).toBe(false);
    expect(source.getUserId()).toBeNull();

    nativeEntry()(authToken("a1"));
    expect(source.hasSettled()).toBe(true);
    expect(source.getUserId()).toBe(7);
  });

  it("3초 안에 답이 없으면 빈 스냅샷으로 확정하고 구독자에게 알린다 — 대기가 영원해지지 않는다", () => {
    const source = createBridgeTokenSource();
    const seen: unknown[] = [];
    source.subscribe((snapshot) => seen.push(snapshot));

    vi.advanceTimersByTime(3000);

    expect(source.hasSettled()).toBe(true);
    expect(source.getUserId()).toBeNull();
    expect(seen).toEqual([{ userId: null, accessToken: null }]);
  });

  it("서버가 토큰을 안 주면 accessToken null로 즉시 답한다", async () => {
    const source = createBridgeTokenSource();
    nativeEntry()(authToken(null));
    await expect(source.getAccessToken()).resolves.toBeNull();
    expect(source.getUserId()).toBe(7);
  });

  it("동시 refresh는 request-token-refresh 한 번으로 묶이고 다음 auth-token으로 함께 풀린다", async () => {
    const source = createBridgeTokenSource();
    nativeEntry()(authToken("a1"));
    const results = Promise.all([source.refresh(), source.refresh(), source.refresh()]);
    expect(sentTypes().filter((type) => type === "request-token-refresh")).toHaveLength(1);
    nativeEntry()(authToken("a2"));
    await expect(results).resolves.toEqual(["a2", "a2", "a2"]);
    expect(source.getCurrentToken()).toBe("a2");
  });

  it("갱신 응답이 10초 안에 안 오면 null이고 다음 refresh는 다시 보낸다", async () => {
    const source = createBridgeTokenSource();
    const pending = source.refresh();
    vi.advanceTimersByTime(10_000);
    await expect(pending).resolves.toBeNull();
    void source.refresh();
    expect(sentTypes().filter((type) => type === "request-token-refresh")).toHaveLength(2);
  });

  it("토큰이 null이어도 refresh는 네이티브에 묻는다 — 지연 이관된 설치가 토큰을 얻는 경로", () => {
    const source = createBridgeTokenSource();
    nativeEntry()(authToken(null));
    void source.refresh();
    expect(sentTypes()).toEqual(["auth-ready", "request-token-refresh"]);
  });

  it("subscribe는 auth-token마다 스냅샷을 알리고 해제할 수 있다", () => {
    const source = createBridgeTokenSource();
    const listener = vi.fn();
    const unsubscribe = source.subscribe(listener);
    nativeEntry()(authToken("a1"));
    expect(listener).toHaveBeenCalledWith({ userId: 7, accessToken: "a1" });
    unsubscribe();
    nativeEntry()(authToken("a2"));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("initTokenSource", () => {
  beforeEach(() => {
    __resetTokenSourceForTests();
    // 브라우저 출처가 만들어지면 곧바로 첫 신원을 받으러 가므로 네트워크를 막아 둔다.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    vi.stubGlobal("BroadcastChannel", undefined);
  });

  afterEach(() => {
    __resetTokenSourceForTests();
  });

  it("guestAuth 표시가 없으면(구버전 셸) 출처를 만들지 않고 auth-ready도 보내지 않는다", () => {
    window.history.replaceState(null, "", "/home?userId=7");
    initTokenSource();
    expect(getTokenSource()).toBeNull();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("브리지가 있고 guestAuth=1이면 브리지 출처를 만들고 auth-ready를 보낸다. 두 번 불러도 한 번만 만든다", () => {
    window.history.replaceState(null, "", "/home?userId=7&guestAuth=1");
    initTokenSource();
    const first = getTokenSource();
    initTokenSource();
    expect(first).not.toBeNull();
    expect(isBrowserTokenSource(first)).toBe(false);
    expect(getTokenSource()).toBe(first);
    expect(sentTypes()).toEqual(["auth-ready"]);
  });

  it("브리지가 없으면 브라우저 출처를 만들고 쿠키 갱신부터 보낸다", async () => {
    vi.stubGlobal("ReactNativeWebView", undefined);
    initTokenSource();
    expect(isBrowserTokenSource(getTokenSource())).toBe(true);
    // 잠금 대기열이 한 박자 뒤에 요청을 보낸다.
    await Promise.resolve();
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toMatch(/\/api\/auth\/refresh$/);
  });

  it("브라우저 로그아웃으로 신원이 바뀌면 모든 조회를 무효화한다", async () => {
    vi.stubGlobal("ReactNativeWebView", undefined);
    const token = (sub: string) => `h.${btoa(JSON.stringify({ sub })).replace(/=+$/, "")}.s`;
    const reply = (status: number, body?: unknown) =>
      Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.endsWith("/api/auth/refresh")
          ? reply(200, { accessToken: token("7") })
          : url.endsWith("/api/auth/logout")
            ? reply(204)
            : reply(201, { isNew: true, accessToken: token("8") }),
      ),
    );
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    initTokenSource();
    await getTokenSource()!.getAccessToken();
    expect(invalidate).not.toHaveBeenCalled();

    await logoutBrowserGuest();

    expect(getTokenSource()!.getUserId()).toBe(8);
    expect(invalidate).toHaveBeenCalledTimes(1);
    invalidate.mockRestore();
  });

  it("자동화 브라우저(navigator.webdriver)에는 출처를 만들지 않는다", () => {
    vi.stubGlobal("ReactNativeWebView", undefined);
    // jsdom에는 이 속성이 없어 직접 만들고 지운다.
    Object.defineProperty(navigator, "webdriver", { value: true, configurable: true });
    try {
      initTokenSource();
      expect(getTokenSource()).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(navigator, "webdriver");
    }
  });

  it.each([
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36",
    "AdsBot-Google (+http://www.google.com/adsbot.html)",
    "Some crawler spider",
  ])("검색 로봇(%s)에는 출처를 만들지 않는다", (userAgent) => {
    vi.stubGlobal("ReactNativeWebView", undefined);
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
    initTokenSource();
    expect(getTokenSource()).toBeNull();
  });

  it("이름에 bot이 든 휴대폰 기종(CUBOT)은 로봇으로 보지 않는다", () => {
    vi.stubGlobal("ReactNativeWebView", undefined);
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
    );
    initTokenSource();
    expect(isBrowserTokenSource(getTokenSource())).toBe(true);
  });
});
