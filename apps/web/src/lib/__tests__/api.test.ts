import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch, parseApiError, parseErrorMessage } from "@/lib/api";
import type * as tokenSourceModule from "@/lib/auth/tokenSource";
import type { TokenSource } from "@/lib/auth/tokenSource";
import { createBridgeTokenSource } from "@/lib/auth/tokenSource";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";

// getTokenSource만 바꿔 끼운다 — createBridgeTokenSource는 진짜를 써야 병렬 401 묶음을 실제로 검증한다.
const mocks = vi.hoisted(() => ({ source: null as TokenSource | null }));
vi.mock("@/lib/auth/tokenSource", async (importOriginal) => ({
  ...(await importOriginal<typeof tokenSourceModule>()),
  getTokenSource: () => mocks.source,
}));

function fakeRes(status: number, body?: unknown): Pick<Response, "status" | "json"> {
  return {
    status,
    json: () => (body === undefined ? Promise.reject(new Error("no body")) : Promise.resolve(body)),
  };
}

describe("parseErrorMessage", () => {
  it("서버 에러 계약 { message }를 읽는다", async () => {
    const err = await parseErrorMessage(fakeRes(400, { message: "잘못된 요청" }), "조회 실패");
    expect(err.message).toBe("잘못된 요청");
  });

  it("본문이 없으면 fallback + HTTP 상태로 대체한다", async () => {
    const err = await parseErrorMessage(fakeRes(500), "조회 실패");
    expect(err.message).toBe("조회 실패 (HTTP 500)");
  });

  it("본문에 message가 없어도 fallback으로 대체한다", async () => {
    const err = await parseErrorMessage(fakeRes(404, {}), "조회 실패");
    expect(err.message).toBe("조회 실패 (HTTP 404)");
  });
});

describe("parseApiError", () => {
  it("서버 에러 계약 { code, message }를 ApiError로 읽는다", async () => {
    const err = await parseApiError(
      fakeRes(409, { code: "CONFLICT", message: "방이 가득 참" }),
      "참여 실패",
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toBe("방이 가득 참");
  });

  it("code가 없으면 code는 undefined로 둔다", async () => {
    const err = await parseApiError(fakeRes(500, { message: "서버 오류" }), "참여 실패");
    expect(err.code).toBeUndefined();
    expect(err.message).toBe("서버 오류");
  });

  it("본문이 JSON이 아니면 fallback + HTTP 상태로 대체하고 status를 보존한다", async () => {
    const err = await parseApiError(fakeRes(502), "참여 실패");
    expect(err.code).toBeUndefined();
    expect(err.status).toBe(502);
    expect(err.message).toBe("참여 실패 (HTTP 502)");
  });
});

describe("apiFetch", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch() {
    const mocked = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = mocked as unknown as typeof fetch;
    return mocked;
  }

  it("기본 헤더 API-Version: 1을 넣는다", async () => {
    const mocked = mockFetch();
    await apiFetch("/api/rooms");
    const [, init] = mocked.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("API-Version")).toBe("1");
  });

  it("호출부가 넘긴 다른 헤더를 보존한다", async () => {
    const mocked = mockFetch();
    await apiFetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const [, init] = mocked.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("API-Version")).toBe("1");
    expect(init.method).toBe("POST");
  });

  it("호출부가 API-Version을 명시하면 그 값이 나간다", async () => {
    const mocked = mockFetch();
    await apiFetch("/api/rooms", { headers: { "API-Version": "2" } });
    const [, init] = mocked.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("API-Version")).toBe("2");
  });

  it("Request 입력의 헤더를 보존하고 API-Version을 더한다", async () => {
    const mocked = mockFetch();
    await apiFetch(new Request("https://api.test/api/rooms", { headers: { "X-Trace": "abc" } }));
    const [, init] = mocked.mock.calls[0] as [Request, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("X-Trace")).toBe("abc");
    expect(headers.get("API-Version")).toBe("1");
  });

  it("Request가 API-Version을 지정하면 그 값이 우선한다", async () => {
    const mocked = mockFetch();
    await apiFetch(new Request("https://api.test/api/rooms", { headers: { "API-Version": "2" } }));
    const [, init] = mocked.mock.calls[0] as [Request, RequestInit];
    expect(new Headers(init.headers).get("API-Version")).toBe("2");
  });
});

describe("apiFetch — Bearer 부착과 401 재시도", () => {
  const originalFetch = globalThis.fetch;
  const status = (code: number) => ({ ok: code < 300, status: code, json: async () => ({}) });
  function fakeSource(
    token: string | null,
    refreshed: string | null = "a2",
    current = token,
  ): TokenSource {
    return {
      getAccessToken: vi.fn().mockResolvedValue(token),
      getCurrentToken: () => current,
      refresh: vi.fn().mockResolvedValue(refreshed),
      getUserId: () => 7,
      hasSettled: () => true,
      subscribe: () => () => {},
    };
  }
  let mockedFetch: ReturnType<typeof vi.fn>;
  const authOf = (call: number) =>
    new Headers((mockedFetch.mock.calls[call] as [string, RequestInit])[1].headers).get(
      "Authorization",
    );

  beforeEach(() => {
    mockedFetch = vi.fn();
    globalThis.fetch = mockedFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    mocks.source = null;
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it("출처가 없으면 헤더 없이 한 번 보낸다 — 브라우저 단독·구버전 셸의 오늘 동작", async () => {
    mockedFetch.mockResolvedValue(status(200));
    await apiFetch("/api/rooms");
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(authOf(0)).toBeNull();
  });

  it("첫 토큰을 기다렸다가 Authorization: Bearer를 붙인다", async () => {
    mocks.source = fakeSource("a1");
    mockedFetch.mockResolvedValue(status(200));
    await apiFetch("/api/rooms");
    expect(authOf(0)).toBe("Bearer a1");
  });

  it("토큰이 null이면 헤더 없이 보낸다", async () => {
    mocks.source = fakeSource(null);
    mockedFetch.mockResolvedValue(status(200));
    await apiFetch("/api/rooms");
    expect(authOf(0)).toBeNull();
  });

  it("401이면 refresh 뒤 같은 input·init(본문·signal)으로 새 토큰을 붙여 1회 재시도한다", async () => {
    mocks.source = fakeSource("a1", "a2");
    mockedFetch.mockResolvedValueOnce(status(401)).mockResolvedValueOnce(status(200));
    const controller = new AbortController();
    const res = await apiFetch("/api/rooms", {
      method: "POST",
      body: '{"x":1}',
      signal: controller.signal,
    });
    expect(res.status).toBe(200);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(authOf(1)).toBe("Bearer a2");
    const [, init] = mockedFetch.mock.calls[1] as [string, RequestInit];
    expect(init.body).toBe('{"x":1}');
    expect(init.signal).toBe(controller.signal);
  });

  it("재시도도 401이면 그대로 돌려주고 다시 갱신하지 않는다 — 갱신 루프 없음", async () => {
    const source = fakeSource("a1", "a2");
    mocks.source = source;
    mockedFetch.mockResolvedValue(status(401));
    const res = await apiFetch("/api/rooms");
    expect(res.status).toBe(401);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(source.refresh).toHaveBeenCalledTimes(1);
  });

  it("갱신이 실패(null)하거나 같은 토큰이면 재시도 없이 401을 돌려준다", async () => {
    mocks.source = fakeSource("a1", null);
    mockedFetch.mockResolvedValue(status(401));
    await expect(apiFetch("/api/rooms")).resolves.toMatchObject({ status: 401 });
    mocks.source = fakeSource("a1", "a1");
    await expect(apiFetch("/api/rooms")).resolves.toMatchObject({ status: 401 });
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it("401을 받았을 때 토큰이 이미 바뀌어 있으면 갱신 요청 없이 현재 토큰으로 재시도한다", async () => {
    const source = fakeSource("a1", "a3", "a2");
    mocks.source = source;
    mockedFetch.mockResolvedValueOnce(status(401)).mockResolvedValueOnce(status(200));
    await apiFetch("/api/rooms");
    expect(source.refresh).not.toHaveBeenCalled();
    expect(authOf(1)).toBe("Bearer a2");
  });

  it("이미 abort된 요청은 401을 그대로 돌려주고 갱신을 요청하지 않는다", async () => {
    const source = fakeSource("a1", "a2");
    mocks.source = source;
    mockedFetch.mockResolvedValue(status(401));
    const controller = new AbortController();
    controller.abort();
    await expect(apiFetch("/api/rooms", { signal: controller.signal })).resolves.toMatchObject({
      status: 401,
    });
    expect(source.refresh).not.toHaveBeenCalled();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("갱신 대기 중 abort되면 재시도 없이 401을 그대로 돌려준다", async () => {
    const controller = new AbortController();
    const source = fakeSource("a1", "a2");
    source.refresh = vi.fn().mockImplementation(async () => {
      controller.abort();
      return "a2";
    });
    mocks.source = source;
    mockedFetch.mockResolvedValue(status(401));
    const res = await apiFetch("/api/rooms", { signal: controller.signal });
    expect(res.status).toBe(401);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(source.refresh).toHaveBeenCalledTimes(1);
  });

  it("Request 입력의 signal도 존중한다 — 갱신 대기 중 abort되면 재시도하지 않는다", async () => {
    const controller = new AbortController();
    // jsdom 환경은 자체 AbortController(DOM 구현체)를 전역에 놓지만 Request는 Node
    // 네이티브라 생성자에 그 signal을 그대로 넘기면 "Expected signal to be an instance of
    // AbortSignal"로 거부한다. 인스턴스 속성으로 얹어 우회한다 — apiFetch는 input.signal만 읽는다.
    const req = new Request("https://api.test/api/rooms");
    Object.defineProperty(req, "signal", { value: controller.signal, configurable: true });
    const source = fakeSource("a1", "a2");
    source.refresh = vi.fn().mockImplementation(async () => {
      controller.abort();
      return "a2";
    });
    mocks.source = source;
    mockedFetch.mockResolvedValue(status(401));
    const res = await apiFetch(req);
    expect(res.status).toBe(401);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(source.refresh).toHaveBeenCalledTimes(1);
  });

  it("병렬 401 N개는 request-token-refresh 하나로 묶이고 모두 새 토큰으로 재시도한다", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    mocks.source = createBridgeTokenSource();
    const entry = (globalThis as unknown as Record<string, (raw: string) => void>)[
      NATIVE_MESSAGE_ENTRY
    ];
    entry(JSON.stringify({ type: "auth-token", userId: 7, accessToken: "a1", atMs: 1 }));
    mockedFetch.mockImplementation(async (_url: string, init: RequestInit) =>
      new Headers(init.headers).get("Authorization") === "Bearer a2" ? status(200) : status(401),
    );

    const pending = Promise.all([apiFetch("/api/a"), apiFetch("/api/b"), apiFetch("/api/c")]);
    await vi.waitFor(() =>
      expect(
        postMessage.mock.calls.filter((call) => String(call[0]).includes("request-token-refresh")),
      ).toHaveLength(1),
    );
    entry(JSON.stringify({ type: "auth-token", userId: 7, accessToken: "a2", atMs: 2 }));

    const results = await pending;
    expect(results.map((res) => res.status)).toEqual([200, 200, 200]);
    expect(mockedFetch).toHaveBeenCalledTimes(6);
  });
});
