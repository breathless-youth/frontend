import { afterEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";
import { getRankingBoard, getRankingRecords, getRankingRecordsSummary } from "@/lib/rankingApi";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  apiFetch,
}));

afterEach(() => apiFetch.mockReset());

function ok(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("getRankingBoard", () => {
  it("종목·기간·구간을 쿼리로 싣고 rankingBoard로 GET한다", async () => {
    apiFetch.mockResolvedValue(ok({ type: "TIME_SLOT" }));

    await expect(
      getRankingBoard({ type: "TIME_SLOT", period: "DAILY", slot: "MORNING" }),
    ).resolves.toEqual({ type: "TIME_SLOT" });
    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/rankings\/board\?type=TIME_SLOT&period=DAILY&slot=MORNING$/),
      expect.objectContaining({ endpoint: "rankingBoard", method: "GET" }),
    );
  });

  it("명예의 전당은 type만 싣는다", async () => {
    apiFetch.mockResolvedValue(ok({}));

    await getRankingBoard({ type: "TOTAL_TIME" });

    expect(apiFetch.mock.calls[0]![0]).toMatch(/\/api\/rankings\/board\?type=TOTAL_TIME$/);
  });

  it("offset은 직전 기간(-1)일 때만 싣는다", async () => {
    apiFetch.mockImplementation(async () => ok({}));

    await getRankingBoard({ type: "FOCUS_TIME", period: "DAILY", offset: 0 });
    await getRankingBoard({ type: "FOCUS_TIME", period: "DAILY", offset: -1 });

    expect(apiFetch.mock.calls[0]![0]).toMatch(/period=DAILY$/);
    expect(apiFetch.mock.calls[1]![0]).toMatch(/period=DAILY&offset=-1$/);
  });

  it("취소 신호를 넘긴다", async () => {
    apiFetch.mockResolvedValue(ok({}));
    const controller = new AbortController();

    await getRankingBoard({ type: "TOTAL_DAYS" }, controller.signal);

    expect(apiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("실패 응답이면 throw한다", async () => {
    apiFetch.mockResolvedValue(new Response("{}", { status: 400 }));

    await expect(getRankingBoard({ type: "FOCUS_TIME", period: "WEEKLY" })).rejects.toThrow();
  });
});

describe("getRankingRecordsSummary", () => {
  it("rankingRecordsSummary로 GET한다", async () => {
    apiFetch.mockResolvedValue(ok({ total: 3 }));

    await expect(getRankingRecordsSummary()).resolves.toEqual({ total: 3 });
    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/rankings\/records\/summary$/),
      expect.objectContaining({ endpoint: "rankingRecordsSummary", method: "GET" }),
    );
  });
});

describe("getRankingRecords", () => {
  it("순위·종목·커서·크기를 싣고 빈 값은 뺀다", async () => {
    apiFetch.mockImplementation(async () => ok({ items: [], nextCursor: null }));

    await getRankingRecords({ rank: 1, size: 6 });
    await getRankingRecords({ type: "TIME_SLOT", cursor: "a+b/c", size: 20 });

    expect(apiFetch.mock.calls[0]![0]).toMatch(/\/api\/rankings\/records\?rank=1&size=6$/);
    expect(apiFetch.mock.calls[1]![0]).toMatch(
      /\/api\/rankings\/records\?type=TIME_SLOT&cursor=a%2Bb%2Fc&size=20$/,
    );
    expect(apiFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ endpoint: "rankingRecords", method: "GET" }),
    );
  });
});
