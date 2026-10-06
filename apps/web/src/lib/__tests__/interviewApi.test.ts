import { afterEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";
import { getInterviewStatus } from "@/lib/interviewApi";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  apiFetch,
}));

afterEach(() => apiFetch.mockReset());

describe("getInterviewStatus", () => {
  it("interview 엔드포인트로 GET한다", async () => {
    const body = { cardEligible: true, cardUrl: "u", settingsEnabled: false, settingsUrl: null };
    apiFetch.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));

    await expect(getInterviewStatus()).resolves.toEqual(body);
    expect(apiFetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/interview\/status$/), {
      endpoint: "interview",
      method: "GET",
    });
  });

  it("실패 응답이면 throw한다", async () => {
    apiFetch.mockResolvedValue(new Response("{}", { status: 401 }));

    await expect(getInterviewStatus()).rejects.toThrow();
  });
});
