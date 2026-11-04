import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AcquisitionRequest, AcquisitionResponse } from "@focusmakers/types";

import { postAcquisition } from "../acquisitionApi";

const mockedFetch = vi.fn();
globalThis.fetch = mockedFetch as unknown as typeof fetch;

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const request: AcquisitionRequest = {
  platform: "ANDROID",
  installReferrer: "gclid=abc",
  deepLinkAd: null,
  googleDeepLinkAd: "g_planner",
  capturedAt: "2026-11-04T01:00:00.000Z",
};

const response: AcquisitionResponse = {
  source: "GOOGLE_AD",
  metaAd: null,
  googleAd: { label: "g_planner" },
  inviteCode: null,
  firstTouchAt: "2026-11-04T01:00:00Z",
};

describe("postAcquisition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("고정 경로로 POST하고 API-Version 1을 싣는다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, response));

    await expect(postAcquisition(request)).resolves.toEqual(response);
    const [url, init] = mockedFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/users/me/acquisition");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("API-Version")).toBe("1");
    expect(JSON.parse(init.body as string)).toEqual(request);
  });

  it("400이면 status 400인 ApiError를 throw한다", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(400, { code: "INVALID", message: "x" }));

    await expect(postAcquisition(request)).rejects.toMatchObject({ name: "ApiError", status: 400 });
  });
});
