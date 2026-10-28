import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getRankingRecords, getRankingRecordsSummary } from "@/lib/rankingApi";
import { rankingKeys } from "@/lib/rankingQueries";
import {
  FIXTURE_RECORDS_PAGE,
  FIXTURE_SUMMARY,
  FIXTURE_SUMMARY_EMPTY,
} from "@/lib/rankingFixtures";
import {
  enterGlassChrome,
  lastInlineControls,
  measureControlsNow,
  resetGlassChrome,
} from "@/test/nativeControlStub";

import { RecordsSheet } from "../RecordsSheet";

vi.mock("@/lib/rankingApi", () => ({
  getRankingBoard: vi.fn(),
  getRankingRecordsSummary: vi.fn(),
  getRankingRecords: vi.fn(),
}));

afterEach(() => {
  onlineManager.setOnline(true);
  vi.clearAllMocks();
});

function renderSheet(
  handlers: Partial<{
    onPickRecord: () => void;
    onShowAll: () => void;
    onFocusStart: () => void;
  }> = {},
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  render(
    <QueryClientProvider client={client}>
      <RecordsSheet
        open
        onOpenChange={vi.fn()}
        userId={7}
        onPickRecord={handlers.onPickRecord ?? vi.fn()}
        onShowAll={handlers.onShowAll ?? vi.fn()}
        onFocusStart={handlers.onFocusStart ?? vi.fn()}
      />
    </QueryClientProvider>,
  );
  return client;
}

describe("RecordsSheet", () => {
  it("최근 기록을 3열로 보이고 모두 보기로 간다", async () => {
    vi.mocked(getRankingRecordsSummary).mockResolvedValue(FIXTURE_SUMMARY);
    const onShowAll = vi.fn();
    renderSheet({ onShowAll });

    expect(screen.getByRole("dialog", { name: "랭킹 기록" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "랭킹 기록" })).toBeInTheDocument();
    expect(screen.getByText("모두 18번")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "1위 아침 구간 일간 · 10월 9일 3:04:20" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "3위 순공 주간 · 10월 1주 41:20:00" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "18개 모두 보기 ›" }));
    expect(onShowAll).toHaveBeenCalledTimes(1);
  });

  it("순위 칩을 누르면 그 순위 기록을 6개까지 받는다", async () => {
    vi.mocked(getRankingRecordsSummary).mockResolvedValue(FIXTURE_SUMMARY);
    vi.mocked(getRankingRecords).mockResolvedValue({
      items: FIXTURE_RECORDS_PAGE.items.filter((item) => item.rank === 2),
      nextCursor: null,
    });
    renderSheet();
    await screen.findByRole("heading", { name: "랭킹 기록" });

    fireEvent.click(screen.getByRole("radio", { name: "2위" }));

    expect(
      await screen.findByRole("button", { name: "2위 심야 구간 일간 · 9월 12일 3:40:05" }),
    ).toBeInTheDocument();
    expect(getRankingRecords).toHaveBeenCalledWith(
      { rank: 2, size: 6, cursor: null },
      expect.any(AbortSignal),
    );
  });

  it("앱 모드에서도 시트 안 순위 칩은 앱 부품으로 바꾸지 않는다", async () => {
    vi.mocked(getRankingRecordsSummary).mockResolvedValue(FIXTURE_SUMMARY);
    const postMessage = enterGlassChrome("/ranking");
    measureControlsNow();
    try {
      renderSheet();
      await screen.findByRole("heading", { name: "랭킹 기록" });

      expect(screen.getByRole("radio", { name: "2위" })).toBeVisible();
      expect(lastInlineControls(postMessage)).toEqual([]);
    } finally {
      cleanup();
      resetGlassChrome();
      vi.restoreAllMocks();
    }
  });

  it("메달을 누르면 그 기록을 넘긴다", async () => {
    vi.mocked(getRankingRecordsSummary).mockResolvedValue(FIXTURE_SUMMARY);
    const onPickRecord = vi.fn();
    renderSheet({ onPickRecord });

    await userEvent.click(
      await screen.findByRole("button", { name: "1위 아침 구간 일간 · 10월 9일 3:04:20" }),
    );

    expect(onPickRecord).toHaveBeenCalledWith(FIXTURE_SUMMARY.recent[0]);
  });

  it("받아 둔 기록으로 열리면 첫 칩이 아니라 시트 자체에 포커스를 두어 화면 낭독기가 시트 안에서 시작한다", async () => {
    // 랭킹 탭은 메달 버튼 숫자 때문에 요약을 먼저 받아 두어, 시트는 자리표시 없이 기록과 함께 열린다.
    // 자리표시를 거치지 않아도 첫 칩이 아니라 시트로 포커스가 가는지 본다.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(rankingKeys.summary(7), FIXTURE_SUMMARY);
    vi.mocked(getRankingRecordsSummary).mockResolvedValue(FIXTURE_SUMMARY);
    renderSheet({}, client);

    expect(screen.getByRole("heading", { name: "랭킹 기록" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("dialog", { name: "랭킹 기록" })).toHaveFocus());
    expect(screen.getByRole("radio", { name: "전체" })).not.toHaveFocus();
  });

  it("기록이 없으면 안내, 최고 순위, 가장 가까운 판, 집중 시작을 보인다", async () => {
    vi.mocked(getRankingRecordsSummary).mockResolvedValue(FIXTURE_SUMMARY_EMPTY);
    const onFocusStart = vi.fn();
    renderSheet({ onFocusStart });

    expect(
      await screen.findByRole("heading", { name: "아직 TOP 3 기록이 없어요" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("마감 때 3위 안에 든 랭킹판이 생기면 여기에 모여요"),
    ).toBeInTheDocument();
    expect(screen.getByText("아침 구간 5위 · 10월 3일")).toBeInTheDocument();
    expect(screen.getByText("아침 구간 12분 차")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "집중 시작" }));
    expect(onFocusStart).toHaveBeenCalledTimes(1);
  });

  // iOS에서 살짝 움직인 탭이 끌기로 잡혀 버려지지 않게, 시트 안 버튼은 끌기 제외 영역 안에 둔다.
  it("빈 상태의 집중 시작은 끌기에서 빼고 안내 제목은 그대로 끌린다", async () => {
    vi.mocked(getRankingRecordsSummary).mockResolvedValue(FIXTURE_SUMMARY_EMPTY);
    renderSheet();

    const focusStart = await screen.findByRole("button", { name: "집중 시작" });
    expect(focusStart.closest("[data-base-ui-swipe-ignore]")).not.toBeNull();
    expect(
      screen
        .getByRole("heading", { name: "아직 TOP 3 기록이 없어요" })
        .closest("[data-base-ui-swipe-ignore]"),
    ).toBeNull();
  });

  it("오류의 다시 시도도 끌기에서 뺀다", async () => {
    vi.mocked(getRankingRecordsSummary).mockRejectedValue(new Error("network"));
    renderSheet();

    const retry = await screen.findByRole("button", { name: "다시 시도" });
    expect(retry.closest("[data-base-ui-swipe-ignore]")).not.toBeNull();
  });

  describe("TOP 3에 가장 가까운 판 줄", () => {
    it("차이가 0이면 지금 TOP 3 안이라고 쓴다", async () => {
      vi.mocked(getRankingRecordsSummary).mockResolvedValue({
        ...FIXTURE_SUMMARY_EMPTY,
        closest: { type: "TIME_SLOT", period: "DAILY", slot: "EVENING", gap: 0 },
      });
      renderSheet();

      await screen.findByRole("heading", { name: "아직 TOP 3 기록이 없어요" });

      expect(screen.getByText("TOP 3에 가장 가까운 판")).toBeInTheDocument();
      expect(screen.getByText("저녁 구간 지금 TOP 3 안")).toBeInTheDocument();
      expect(screen.queryByText(/차$/)).toBeNull();
    });

    it("차이가 있으면 남은 시간을 쓴다", async () => {
      vi.mocked(getRankingRecordsSummary).mockResolvedValue({
        ...FIXTURE_SUMMARY_EMPTY,
        closest: { type: "TIME_SLOT", period: "DAILY", slot: "EVENING", gap: 30 },
      });
      renderSheet();

      await screen.findByRole("heading", { name: "아직 TOP 3 기록이 없어요" });

      expect(screen.getByText("TOP 3에 가장 가까운 판")).toBeInTheDocument();
      expect(screen.getByText("저녁 구간 1분 차")).toBeInTheDocument();
      expect(screen.queryByText(/지금 TOP 3 안/)).toBeNull();
    });
  });

  it("없는 줄은 뺀다", async () => {
    vi.mocked(getRankingRecordsSummary).mockResolvedValue({ ...FIXTURE_SUMMARY_EMPTY, best: null });
    renderSheet();

    await screen.findByRole("heading", { name: "아직 TOP 3 기록이 없어요" });

    expect(screen.queryByText("지금까지 최고 순위")).toBeNull();
    expect(screen.getByText("TOP 3에 가장 가까운 판")).toBeInTheDocument();
  });

  it("요약을 못 받으면 다시 시도를 보이고, 다시 받으면 기록을 보인다", async () => {
    vi.mocked(getRankingRecordsSummary)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(FIXTURE_SUMMARY);
    renderSheet();

    expect(await screen.findByText("랭킹 기록을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "랭킹 기록" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "랭킹 기록" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByRole("heading", { name: "랭킹 기록" })).toBeInTheDocument();
    expect(screen.getByText("모두 18번")).toBeInTheDocument();
  });

  it("받은 적 없는 기록을 오프라인에서 열면 오류와 다시 시도를 보이고, 연결되면 기록을 보인다", async () => {
    vi.mocked(getRankingRecordsSummary).mockResolvedValue(FIXTURE_SUMMARY);
    onlineManager.setOnline(false);
    renderSheet();

    expect(await screen.findByText("랭킹 기록을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    expect(getRankingRecordsSummary).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));

    expect(await screen.findByRole("heading", { name: "랭킹 기록" })).toBeInTheDocument();
    expect(screen.getByText("모두 18번")).toBeInTheDocument();
  });

  it("순위 칩의 기록을 오프라인이라 못 받으면 오류와 다시 시도를 보이고, 연결되면 기록을 보인다", async () => {
    vi.mocked(getRankingRecordsSummary).mockResolvedValue(FIXTURE_SUMMARY);
    vi.mocked(getRankingRecords).mockResolvedValue({
      items: FIXTURE_RECORDS_PAGE.items.filter((item) => item.rank === 2),
      nextCursor: null,
    });
    renderSheet();
    await screen.findByRole("heading", { name: "랭킹 기록" });

    act(() => onlineManager.setOnline(false));
    fireEvent.click(screen.getByRole("radio", { name: "2위" }));

    expect(await screen.findByText("랭킹 기록을 불러오지 못했어요")).toBeInTheDocument();
    expect(getRankingRecords).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));

    expect(
      await screen.findByRole("button", { name: "2위 심야 구간 일간 · 9월 12일 3:40:05" }),
    ).toBeInTheDocument();
  });

  it("다시 받다 실패해도 받아 둔 기록을 그대로 보인다", async () => {
    vi.mocked(getRankingRecordsSummary).mockResolvedValue(FIXTURE_SUMMARY);
    const client = renderSheet();
    await screen.findByRole("heading", { name: "랭킹 기록" });

    vi.mocked(getRankingRecordsSummary).mockRejectedValue(new Error("network"));
    await act(async () => {
      await client.refetchQueries();
      // react-query는 상태 변경 알림을 다음 틱에 묶어 보내므로 한 틱 더 기다려야 화면에 반영된다.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(client.getQueryState(rankingKeys.summary(7))?.status).toBe("error");
    expect(screen.queryByText("랭킹 기록을 불러오지 못했어요")).toBeNull();
    expect(screen.getByText("모두 18번")).toBeInTheDocument();
  });
});
