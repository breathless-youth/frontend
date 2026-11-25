import { afterEach, describe, expect, it, vi } from "vitest";

import { putPremiumWaitlist } from "../premiumWaitlistApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("putPremiumWaitlist", () => {
  const body = {
    price: 2900,
    placement: "RESULT",
    ageOver14: true,
    email: "minjun@example.com",
    expectedFeature: null,
  } as const;

  it("PUT /api/premium-waitlist/me에 API-Version 2와 본문을 보낸다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    await putPremiumWaitlist(body);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/premium-waitlist\/me$/);
    expect(init.method).toBe("PUT");
    expect(new Headers(init.headers).get("API-Version")).toBe("2");
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it("실패 응답이면 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ code: "INVALID", message: "bad" }),
      }),
    );
    await expect(putPremiumWaitlist(body)).rejects.toMatchObject({ status: 400, code: "INVALID" });
  });
});
