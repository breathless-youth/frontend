import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createBridgeTokenSource,
  getTokenSource,
  initBridgeTokenSource,
} from "@/lib/auth/tokenSource";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";

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

describe("initBridgeTokenSource", () => {
  it("guestAuth 표시가 없으면(구버전 셸) 출처를 만들지 않고 auth-ready도 보내지 않는다", () => {
    window.history.replaceState(null, "", "/home?userId=7");
    initBridgeTokenSource();
    expect(getTokenSource()).toBeNull();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("브리지가 없으면(브라우저 단독) 출처를 만들지 않는다", () => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/home?userId=7&guestAuth=1");
    initBridgeTokenSource();
    expect(getTokenSource()).toBeNull();
  });

  it("브리지가 있고 guestAuth=1이면 출처를 만들고 auth-ready를 보낸다. 두 번 불러도 한 번만 만든다", () => {
    window.history.replaceState(null, "", "/home?userId=7&guestAuth=1");
    initBridgeTokenSource();
    const first = getTokenSource();
    initBridgeTokenSource();
    expect(first).not.toBeNull();
    expect(getTokenSource()).toBe(first);
    expect(sentTypes()).toEqual(["auth-ready"]);
  });
});
