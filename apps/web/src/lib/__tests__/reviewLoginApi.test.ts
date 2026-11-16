import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { getReviewLoginStatus } from "@/lib/reviewLoginApi";

const fetchMock = vi.fn<typeof fetch>();

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("getReviewLoginStatus", () => {
  it("앱 버전을 쿼리로 실어 토큰 없이 API-Version 1로 묻는다", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ enabled: true }), { status: 200 }));

    await expect(getReviewLoginStatus("26.47.0")).resolves.toEqual({ enabled: true });

    const [input, init] = fetchMock.mock.calls[0]!;
    expect(String(input)).toContain("/api/auth/review-login/status?appVersion=26.47.0");
    const headers = new Headers(init?.headers);
    expect(headers.get("API-Version")).toBe("1");
    expect(headers.get("Authorization")).toBeNull();
  });

  it("enabled가 참이 아니면 거짓으로 받고, 실패 응답은 ApiError로 던진다", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    await expect(getReviewLoginStatus("26.47.0")).resolves.toEqual({ enabled: false });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: "X" }), { status: 500 }));
    await expect(getReviewLoginStatus("26.47.0")).rejects.toBeInstanceOf(ApiError);
  });
});
