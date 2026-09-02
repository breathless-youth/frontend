import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch, parseApiError, parseErrorMessage } from "@/lib/api";

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
