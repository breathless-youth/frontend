import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { completeHomeMissionStep, getHomeMission } from "@/lib/homeMissionApi";

const state = {
  version: "home-v3",
  startsOn: "2026-11-07",
  completedSteps: 1,
  currentStep: 2,
  eligible: true,
  measuredFocusSec: 300,
};
afterEach(() => vi.unstubAllGlobals());

describe("home mission HTTP contract", () => {
  it("reads the server step and eligibility with API-Version 1 and forwards cancellation", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => state });
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    expect(await getHomeMission(signal)).toEqual(state);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/home/mission");
    expect(init.method).toBe("GET");
    expect(init.signal).toBe(signal);
    expect(new Headers(init.headers).get("API-Version")).toBe("1");
  });

  it("confirms exactly the requested step without a request body", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => state });
    vi.stubGlobal("fetch", fetch);
    expect(await completeHomeMissionStep(1)).toEqual(state);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/home/mission/steps/1/complete");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).get("API-Version")).toBe("1");
  });

  it("preserves backend failure codes instead of treating failure as completion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ code: "BAD_REQUEST", message: "not eligible" }),
      }),
    );
    await expect(completeHomeMissionStep(2)).rejects.toMatchObject({
      status: 400,
      code: "BAD_REQUEST",
    });
    await expect(getHomeMission()).rejects.toBeInstanceOf(ApiError);
  });
});
