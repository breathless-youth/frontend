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

  it("기본 헤더 API-Version: 1을 넣는다", async () => {
    const mocked = mockFetch();
    await apiFetch("https://api.example.com/api/users");
    const [, init] = mocked.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("API-Version")).toBe("1");
  });

  it("호출부가 넘긴 다른 헤더를 보존한다", async () => {
    const mocked = mockFetch();
    await apiFetch("https://api.example.com/api/users", {
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
    await apiFetch("https://api.example.com/api/users", { headers: { "API-Version": "2" } });
    const [, init] = mocked.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("API-Version")).toBe("2");
  });

  it("Request 입력의 헤더를 보존하고 API-Version을 더한다", async () => {
    const mocked = mockFetch();
    await apiFetch(
      new Request("https://api.example.com/api/users", { headers: { "X-Trace": "abc" } }),
    );
    const [, init] = mocked.mock.calls[0] as [Request, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("X-Trace")).toBe("abc");
    expect(headers.get("API-Version")).toBe("1");
  });

  it("Request가 API-Version을 지정하면 그 값이 우선한다", async () => {
    const mocked = mockFetch();
    await apiFetch(
      new Request("https://api.example.com/api/users", { headers: { "API-Version": "2" } }),
    );
    const [, init] = mocked.mock.calls[0] as [Request, RequestInit];
    expect(new Headers(init.headers).get("API-Version")).toBe("2");
  });
});
