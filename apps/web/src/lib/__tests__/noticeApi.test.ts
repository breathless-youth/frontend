import { afterEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";
import { getActiveNotices } from "@/lib/noticeApi";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  apiFetch,
}));

afterEach(() => apiFetch.mockReset());

describe("getActiveNotices", () => {
  it("notices 엔드포인트로 GET하고 배열을 돌려준다", async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify([{ id: 1 }]), { status: 200 }));

    await expect(getActiveNotices()).resolves.toEqual([{ id: 1 }]);
    expect(apiFetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/notices\/active$/), {
      endpoint: "notices",
      method: "GET",
    });
  });

  it("실패 응답이면 throw한다", async () => {
    apiFetch.mockResolvedValue(new Response("{}", { status: 500 }));

    await expect(getActiveNotices()).rejects.toThrow();
  });
});
