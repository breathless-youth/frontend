import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FIXTURE_FOCUS_WEEKLY, FIXTURE_RECORDS_PAGE } from "@/lib/rankingFixtures";
import { getRankingBoard, getRankingRecords } from "@/lib/rankingApi";
import {
  LIVE_POLL_MS,
  rankingBoardQuery,
  rankingKeys,
  rankingRecordsQuery,
  rankingSummaryQuery,
} from "@/lib/rankingQueries";

vi.mock("@/lib/rankingApi", () => ({
  getRankingBoard: vi.fn(),
  getRankingRecordsSummary: vi.fn(),
  getRankingRecords: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe("랭킹판 쿼리", () => {
  it("순공·시간대 지금 판은 10초 신선하고 보이는 동안 15초마다 다시 받는다", () => {
    const options = rankingBoardQuery(7, { type: "FOCUS_TIME", period: "WEEKLY" });

    expect(options.queryKey).toEqual(["ranking", "board", 7, "FOCUS_TIME", "WEEKLY", null, 0]);
    expect(options.staleTime).toBe(10_000);
    expect(options.refetchInterval).toBe(LIVE_POLL_MS);
    expect(options.refetchIntervalInBackground).toBe(false);
  });

  it("집중률과 명예의 전당은 60초 신선하고 폴링하지 않는다", () => {
    expect(rankingBoardQuery(7, { type: "FOCUS_RATE", period: "WEEKLY" })).toMatchObject({
      staleTime: 60_000,
      refetchInterval: false,
    });
    expect(rankingBoardQuery(7, { type: "MAX_STREAK" })).toMatchObject({
      staleTime: 60_000,
      refetchInterval: false,
    });
  });

  it("직전 기간은 5분 신선하고 폴링하지 않는다", () => {
    const options = rankingBoardQuery(7, { type: "FOCUS_TIME", period: "DAILY", offset: -1 });

    expect(options.queryKey.at(-1)).toBe(-1);
    expect(options).toMatchObject({ staleTime: 300_000, refetchInterval: false });
  });

  it("받을 때 파라미터와 취소 신호를 넘긴다", async () => {
    vi.mocked(getRankingBoard).mockResolvedValue(FIXTURE_FOCUS_WEEKLY);
    const client = new QueryClient();

    await client.fetchQuery(
      rankingBoardQuery(7, { type: "TIME_SLOT", period: "DAILY", slot: "DAWN" }),
    );

    expect(getRankingBoard).toHaveBeenCalledWith(
      { type: "TIME_SLOT", period: "DAILY", slot: "DAWN" },
      expect.any(AbortSignal),
    );
  });
});

describe("기록 쿼리", () => {
  it("요약 키는 사용자별이고 60초 신선하며 폴링하지 않는다", () => {
    expect(rankingSummaryQuery(7)).toMatchObject({
      queryKey: ["ranking", "records", "summary", 7],
      staleTime: 60_000,
    });
    expect(rankingSummaryQuery(7).refetchInterval).toBeUndefined();
  });

  it("목록은 커서로 다음 페이지를 받고 마지막이면 멈춘다", async () => {
    vi.mocked(getRankingRecords).mockResolvedValue({ ...FIXTURE_RECORDS_PAGE, nextCursor: "c2" });
    const options = rankingRecordsQuery(7, { rank: 1, size: 20 });
    const client = new QueryClient();

    await client.fetchInfiniteQuery(options);

    expect(options.queryKey).toEqual(["ranking", "records", "list", 7, 1, "all", 20]);
    expect(getRankingRecords).toHaveBeenCalledWith(
      { rank: 1, size: 20, cursor: null },
      expect.any(AbortSignal),
    );
    expect(options.getNextPageParam({ items: [], nextCursor: "c2" }, [], null, [null])).toBe("c2");
    expect(options.getNextPageParam({ items: [], nextCursor: null }, [], null, [null])).toBeNull();
  });

  it("무효화 뿌리는 ranking 하나다", () => {
    expect(rankingKeys.all).toEqual(["ranking"]);
  });
});
