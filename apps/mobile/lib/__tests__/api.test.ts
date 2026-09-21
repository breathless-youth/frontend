import { apiFetch } from "../api";

describe("apiFetch", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch() {
    const mocked = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = mocked as unknown as typeof fetch;
    return mocked;
  }

  function sentHeaders(mocked: jest.Mock): Headers {
    const [, init] = mocked.mock.calls[0] as [unknown, RequestInit];
    return new Headers(init.headers);
  }

  it("등록은 API-Version 2를 보낸다", async () => {
    const mocked = mockFetch();
    await apiFetch("https://api.example.com/api/users", { endpoint: "register" });
    expect(sentHeaders(mocked).get("API-Version")).toBe("2");
  });

  it("갱신은 API-Version 1을 보낸다 — 구 앱에 없던 새 경로다", async () => {
    const mocked = mockFetch();
    await apiFetch("https://api.example.com/api/auth/refresh", { endpoint: "refresh" });
    expect(sentHeaders(mocked).get("API-Version")).toBe("1");
  });

  it("호출부가 넘긴 다른 헤더와 method·body를 보존한다", async () => {
    const mocked = mockFetch();
    await apiFetch("https://api.example.com/api/users", {
      endpoint: "register",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"deviceId":"a"}',
    });
    const [, init] = mocked.mock.calls[0] as [unknown, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("API-Version")).toBe("2");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"deviceId":"a"}');
  });

  it("endpoint는 fetch로 넘어가지 않는다", async () => {
    const mocked = mockFetch();
    await apiFetch("https://api.example.com/api/users", { endpoint: "register" });
    const [, init] = mocked.mock.calls[0] as [unknown, RequestInit & { endpoint?: unknown }];
    expect(init.endpoint).toBeUndefined();
  });

  it("호출부가 API-Version을 직접 넣어도 엔드포인트 값이 이긴다", async () => {
    // 버전은 엔드포인트가 정한다. 호출부가 고를 수 있게 두면 레지스트리가 유일한 원천이 아니게 된다.
    const mocked = mockFetch();
    await apiFetch("https://api.example.com/api/auth/refresh", {
      endpoint: "refresh",
      headers: { "API-Version": "2" },
    });
    expect(sentHeaders(mocked).get("API-Version")).toBe("1");
  });

  it("Request 입력의 헤더를 보존하고 엔드포인트 버전을 더한다", async () => {
    const mocked = mockFetch();
    await apiFetch(
      new Request("https://api.example.com/api/users", { headers: { "X-Trace": "abc" } }),
      {
        endpoint: "register",
      },
    );
    const headers = sentHeaders(mocked);
    expect(headers.get("X-Trace")).toBe("abc");
    expect(headers.get("API-Version")).toBe("2");
  });
});
