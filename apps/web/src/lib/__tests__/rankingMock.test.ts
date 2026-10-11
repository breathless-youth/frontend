import { afterEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";
import { getRankingBoard, getRankingRecordsSummary } from "@/lib/rankingApi";
import { FIXTURE_OVERTAKEN, FIXTURE_SUMMARY_EMPTY } from "@/lib/rankingFixtures";
import {
  __resetRankingMockForTests,
  activeRankingScene,
  mockBoard,
  mockRecords,
} from "@/lib/rankingMock";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  apiFetch,
}));

afterEach(() => {
  window.history.replaceState(null, "", "/");
  __resetRankingMockForTests();
  apiFetch.mockReset();
});

function open(path: string): void {
  window.history.replaceState(null, "", path);
  __resetRankingMockForTests();
}

describe("장면 고르기", () => {
  it("주소에 장면이 없거나 모르는 장면이면 끈다", () => {
    open("/ranking");
    expect(activeRankingScene()).toBeNull();

    open("/ranking?rankingMock=party");
    expect(activeRankingScene()).toBeNull();
  });

  it("한 번 읽어 두어 앱 안 이동으로 쿼리가 사라져도 남는다", () => {
    open("/ranking?rankingMock=reset");
    expect(activeRankingScene()).toBe("reset");

    window.history.replaceState(null, "", "/ranking/records");
    expect(activeRankingScene()).toBe("reset");
  });
});

describe("가짜 응답", () => {
  it("종목에 맞는 판을 주고 시각을 지금 기준으로 다시 잡는다", () => {
    const board = mockBoard("default", { type: "FOCUS_RATE", period: "MONTHLY" });

    expect(board.type).toBe("FOCUS_RATE");
    expect(Math.abs(Date.parse(board.asOf) - Date.now())).toBeLessThan(5000);
    expect(Date.parse(board.closesAt!)).toBeGreaterThan(Date.now());
  });

  it("추월 장면은 두 번째 응답부터 내려간 판을 준다", () => {
    mockBoard("overtake", { type: "FOCUS_TIME", period: "WEEKLY" });

    expect(mockBoard("overtake", { type: "FOCUS_TIME", period: "WEEKLY" }).me).toEqual(
      FIXTURE_OVERTAKEN.me,
    );
  });

  it("기록 목록은 순위·종목으로 거르고 크기만큼 자른다", () => {
    const page = mockRecords("default", { rank: 1, type: "TIME_SLOT", size: 1 });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ rank: 1, type: "TIME_SLOT" });
  });

  it("장면이 켜져 있으면 서버를 부르지 않는다", async () => {
    open("/ranking?rankingMock=no-records");

    await expect(getRankingRecordsSummary()).resolves.toEqual(FIXTURE_SUMMARY_EMPTY);
    await getRankingBoard({ type: "TOTAL_TIME" });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
