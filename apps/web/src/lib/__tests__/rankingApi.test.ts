import { afterEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";
import {
  getRankingBoard,
  getRankingRecords,
  getRankingRecordsSummary,
  getRankingRecordsUnseen,
  getRankingSessionGains,
  postRankingRecordsSeen,
} from "@/lib/rankingApi";
import { FIXTURE_UNSEEN_ONE } from "@/lib/rankingFixtures";

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

describe("노출 지점 호출", () => {
  it("안 본 기록은 rankingRecordsUnseen으로 GET한다", async () => {
    apiFetch.mockResolvedValue(ok(FIXTURE_UNSEEN_ONE));

    await expect(getRankingRecordsUnseen()).resolves.toEqual(FIXTURE_UNSEEN_ONE);
    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/rankings\/records\/unseen$/),
      expect.objectContaining({ endpoint: "rankingRecordsUnseen", method: "GET" }),
    );
  });

  it("본 것 표시는 id를 JSON 본문으로 POST한다", async () => {
    apiFetch.mockResolvedValue(new Response(null, { status: 204 }));

    await postRankingRecordsSeen([31, 32]);

    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/rankings\/records\/seen$/),
      expect.objectContaining({
        endpoint: "rankingRecordsSeen",
        method: "POST",
        body: JSON.stringify({ ids: [31, 32] }),
      }),
    );
    const init = apiFetch.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it("본 것 표시는 빈 목록이면 보내지 않고, 100개를 넘으면 앞 100개만 보낸다", async () => {
    apiFetch.mockImplementation(async () => new Response(null, { status: 204 }));

    await postRankingRecordsSeen([]);
    expect(apiFetch).not.toHaveBeenCalled();

    await postRankingRecordsSeen(Array.from({ length: 120 }, (_, index) => index + 1));
    const body = JSON.parse(String((apiFetch.mock.calls[0]![1] as RequestInit).body)) as {
      ids: number[];
    };
    expect(body.ids).toHaveLength(100);
    expect(body.ids.at(-1)).toBe(100);
  });

  it("본 것 표시가 실패하면 throw한다", async () => {
    apiFetch.mockResolvedValue(new Response("{}", { status: 400 }));

    await expect(postRankingRecordsSeen([1])).rejects.toThrow();
  });

  it("오른 순위는 startedAt을 쿼리로 싣고 rankingSessionGains로 GET한다", async () => {
    apiFetch.mockResolvedValue(ok({ weekly: { before: 9, after: 7, delta: 2 }, others: [] }));
    const controller = new AbortController();

    await expect(
      getRankingSessionGains("2026-10-12T00:00:00.000Z", controller.signal),
    ).resolves.toEqual({ weekly: { before: 9, after: 7, delta: 2 }, others: [] });
    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/api\/rankings\/session-gains\?startedAt=2026-10-12T00%3A00%3A00\.000Z$/,
      ),
      expect.objectContaining({
        endpoint: "rankingSessionGains",
        method: "GET",
        signal: controller.signal,
      }),
    );
  });

  it("그 시각의 세션이 없다는 404는 오른 판이 없는 응답으로 바꾼다", async () => {
    apiFetch.mockResolvedValue(new Response("{}", { status: 404 }));

    await expect(getRankingSessionGains("2026-10-12T00:00:00.000Z")).resolves.toEqual({
      weekly: null,
      others: [],
    });
  });

  it("404가 아닌 실패는 throw한다", async () => {
    apiFetch.mockResolvedValue(new Response("{}", { status: 500 }));

    await expect(getRankingSessionGains("2026-10-12T00:00:00.000Z")).rejects.toThrow();
  });
});
