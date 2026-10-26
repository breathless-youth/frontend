import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockAllIsIntersecting } from "react-intersection-observer/test-utils";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMemoryBoardMemoryStore,
  requestRecordsPage,
  resetBoardMemoryStore,
  setBoardMemoryStore,
  takeRecordsPageRequest,
} from "@/features/ranking/model/boardMemory";
import type * as Amplitude from "@/lib/amplitude";
import { getRankingRecords, getRankingRecordsSummary } from "@/lib/rankingApi";
import { FIXTURE_RECORDS_PAGE, FIXTURE_SUMMARY } from "@/lib/rankingFixtures";
import { useIdentityPending, useUserId } from "@/lib/userId";
import type * as UserId from "@/lib/userId";
import { RankingRecordsPage } from "@/routes/RankingRecordsPage";
import {
  enterGlassChrome,
  lastInlineControls,
  measureControlsNow,
  pressNative,
  resetGlassChrome,
} from "@/test/nativeControlStub";

vi.mock("@/lib/rankingApi", () => ({
  getRankingBoard: vi.fn(),
  getRankingRecordsSummary: vi.fn(),
  getRankingRecords: vi.fn(),
}));
vi.mock("@/lib/userId", async (importOriginal) => ({
  ...(await importOriginal<typeof UserId>()),
  useUserId: vi.fn(() => 7),
  useIdentityPending: vi.fn(() => false),
}));
const analytics = vi.hoisted(() => ({
  trackRankingRecordTapped: vi.fn(),
  trackErrorRetryPressed: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  ...analytics,
}));

let store: ReturnType<typeof createMemoryBoardMemoryStore>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-10T03:00:00Z"));
  store = createMemoryBoardMemoryStore();
  setBoardMemoryStore(store);
  vi.mocked(getRankingRecordsSummary).mockResolvedValue(FIXTURE_SUMMARY);
  vi.mocked(getRankingRecords).mockResolvedValue(FIXTURE_RECORDS_PAGE);
});

afterEach(() => {
  // 화면을 먼저 내린다.
  // 붙어 있는 화면은 포커스 초기화에 반응해 요청을 꺼내므로, 그대로 두면 저장소 되돌리기와의 줄 순서에 결과가 달린다.
  cleanup();
  vi.useRealTimers();
  onlineManager.setOnline(true);
  focusManager.setFocused(undefined);
  resetBoardMemoryStore();
  vi.clearAllMocks();
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/ranking/records?userId=7"]}>
        <Routes>
          <Route path="/ranking/records" element={<RankingRecordsPage />} />
          <Route path="/ranking" element={<p>랭킹 화면</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RankingRecordsPage", () => {
  it("신원을 기다리는 동안은 등록 전 안내 대신 자리표시를 보인다", () => {
    vi.mocked(useUserId).mockReturnValueOnce(null);
    vi.mocked(useIdentityPending).mockReturnValueOnce(true);
    renderPage();

    expect(screen.queryByText("기기 등록 전이에요. 앱에서 열면 기록이 저장돼요")).toBeNull();
    expect(getRankingRecordsSummary).not.toHaveBeenCalled();
  });

  it("요약 카드에 모두 몇 번과 금·은·동 수를 보인다", async () => {
    renderPage();

    const summary = await screen.findByRole("region", { name: "지금까지 TOP 3" });
    expect(summary).toHaveTextContent("18번");
    expect(within(summary).getByRole("listitem", { name: "1위 7번" })).toBeInTheDocument();
    expect(within(summary).getByRole("listitem", { name: "3위 6번" })).toBeInTheDocument();
  });

  it("기록을 달별로 묶는다", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "10월" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "9월" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "3위 순공 주간 · 10월 1주 41:20:00" }),
    ).toBeInTheDocument();
  });

  it("목록 끝에 닿으면 다음 페이지를 받는다", async () => {
    vi.mocked(getRankingRecords)
      .mockResolvedValueOnce({ ...FIXTURE_RECORDS_PAGE, nextCursor: "c2" })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    renderPage();
    await screen.findByRole("heading", { name: "10월" });

    mockAllIsIntersecting(true);

    await vi.waitFor(() =>
      expect(getRankingRecords).toHaveBeenCalledWith(
        { size: 20, cursor: "c2" },
        expect.any(AbortSignal),
      ),
    );
    expect(getRankingRecords).toHaveBeenCalledTimes(2);
  });

  it("받는 중에 끝이 보여도 첫 페이지를 받자마자 다음 페이지를 부르지 않는다", async () => {
    let resolveFirst: (page: typeof FIXTURE_RECORDS_PAGE) => void = () => {};
    vi.mocked(getRankingRecords).mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirst = resolve)),
    );
    renderPage();
    await vi.waitFor(() => expect(getRankingRecords).toHaveBeenCalledTimes(1));

    // 자리표시만 있을 때는 화면 끝이 보이는 상태다.
    mockAllIsIntersecting(true);
    resolveFirst({ ...FIXTURE_RECORDS_PAGE, nextCursor: "c2" });
    await screen.findByRole("heading", { name: "10월" });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getRankingRecords).toHaveBeenCalledTimes(1);
  });

  it("다음 페이지를 못 받으면 다시 부르지 않고 다시 시도로 받는다", async () => {
    let failNext = true;
    vi.mocked(getRankingRecords).mockImplementation(async ({ cursor }) => {
      if (cursor === null) {
        return { ...FIXTURE_RECORDS_PAGE, nextCursor: "c2" };
      }
      if (failNext) {
        // 실제 요청처럼 받는 중 상태가 한 번 그려진 뒤 실패하게 한다.
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error("network");
      }
      return { items: [], nextCursor: null };
    });
    renderPage();
    await screen.findByRole("heading", { name: "10월" });

    mockAllIsIntersecting(true);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(getRankingRecords).toHaveBeenCalledTimes(2);
    const retry = await screen.findByRole("button", { name: "다시 시도" });

    failNext = false;
    await userEvent.click(retry);

    await vi.waitFor(() =>
      expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument(),
    );
    expect(getRankingRecords).toHaveBeenCalledTimes(3);
    expect(getRankingRecords).toHaveBeenLastCalledWith(
      { size: 20, cursor: "c2" },
      expect.any(AbortSignal),
    );
  });

  it("순위 칩과 종목으로 거른다", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "10월" });

    fireEvent.click(screen.getByRole("radio", { name: "1위" }));
    await vi.waitFor(() =>
      expect(getRankingRecords).toHaveBeenCalledWith(
        { rank: 1, size: 20, cursor: null },
        expect.any(AbortSignal),
      ),
    );

    screen.getByRole("button", { name: "종목: 모든 종목" }).focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.click(await screen.findByRole("menuitem", { name: "시간대" }));
    await vi.waitFor(() =>
      expect(getRankingRecords).toHaveBeenCalledWith(
        { rank: 1, type: "TIME_SLOT", size: 20, cursor: null },
        expect.any(AbortSignal),
      ),
    );
  });

  it("앱 모드에서는 순위 칩을 네이티브 세그먼트로 보내고 누르면 그 순위로 거른다", async () => {
    const postMessage = enterGlassChrome("/ranking/records");
    measureControlsNow();
    try {
      renderPage();
      await screen.findByRole("heading", { name: "10월" });

      expect(lastInlineControls(postMessage)).toContainEqual(
        expect.objectContaining({
          id: "segment-rank-chips",
          kind: "segment",
          labels: ["전체", "1위", "2위", "3위"],
          selected: 0,
          disabled: [false, false, false, false],
          accessibilityLabel: "순위",
        }),
      );

      pressNative("segment-rank-chips", 1);
      await vi.waitFor(() =>
        expect(getRankingRecords).toHaveBeenCalledWith(
          { rank: 1, size: 20, cursor: null },
          expect.any(AbortSignal),
        ),
      );
    } finally {
      cleanup();
      resetGlassChrome();
      vi.restoreAllMocks();
    }
  });

  it("기록을 처음에 못 받으면 오류를 보이고 다시 시도로 다시 받는다", async () => {
    vi.mocked(getRankingRecords).mockRejectedValueOnce(new Error("network"));
    renderPage();

    expect(await screen.findByText("랭킹 기록을 불러오지 못했어요")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByRole("heading", { name: "10월" })).toBeInTheDocument();
    expect(getRankingRecords).toHaveBeenCalledTimes(2);
  });

  it("요약을 못 받으면 카드를 빼고 목록은 그대로 보인다", async () => {
    vi.mocked(getRankingRecordsSummary).mockRejectedValue(new Error("network"));
    renderPage();

    expect(await screen.findByRole("heading", { name: "10월" })).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(screen.queryByRole("status", { name: "불러오는 중" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("region", { name: "지금까지 TOP 3" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
  });

  it("요약과 목록을 모두 못 받으면 목록의 다시 시도가 요약 카드도 다시 받는다", async () => {
    vi.mocked(getRankingRecordsSummary).mockRejectedValueOnce(new Error("network"));
    vi.mocked(getRankingRecords).mockRejectedValueOnce(new Error("network"));
    renderPage();

    expect(await screen.findByText("랭킹 기록을 불러오지 못했어요")).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(screen.queryByRole("status", { name: "불러오는 중" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("region", { name: "지금까지 TOP 3" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    const summary = await screen.findByRole("region", { name: "지금까지 TOP 3" });
    expect(summary).toHaveTextContent("18번");
    expect(await screen.findByRole("heading", { name: "10월" })).toBeInTheDocument();
    expect(getRankingRecordsSummary).toHaveBeenCalledTimes(2);
  });

  it("오프라인에서 처음 열면 요약 카드를 빼고 목록 오류를 보이고, 연결되면 둘 다 보인다", async () => {
    onlineManager.setOnline(false);
    renderPage();

    expect(await screen.findByText("랭킹 기록을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "불러오는 중" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "지금까지 TOP 3" })).not.toBeInTheDocument();

    act(() => onlineManager.setOnline(true));

    const summary = await screen.findByRole("region", { name: "지금까지 TOP 3" });
    expect(summary).toHaveTextContent("18번");
    expect(await screen.findByRole("heading", { name: "10월" })).toBeInTheDocument();
  });

  it("걸러서 남는 기록이 없으면 안내한다", async () => {
    vi.mocked(getRankingRecords).mockResolvedValue({ items: [], nextCursor: null });
    renderPage();

    expect(await screen.findByText("조건에 맞는 기록이 없어요")).toBeInTheDocument();
  });

  it("메달을 누르면 그 판을 넘겨주고 랭킹으로 돌아간다", async () => {
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "1위 오전 구간 일간 · 10월 9일 3:04:20" }),
    );

    expect(await screen.findByText("랭킹 화면")).toBeInTheDocument();
    expect(JSON.parse(store.raw!)).toMatchObject({
      active: "ranking",
      ranking: { type: "TIME_SLOT", period: "DAILY" },
      requestedSlot: "MORNING",
    });
    expect(analytics.trackRankingRecordTapped).toHaveBeenCalledWith({
      rank: 1,
      type: "TIME_SLOT",
      period: "DAILY",
      from: "all",
    });
  });

  it("열 때 남아 있던 모두 보기 요청을 버린다", () => {
    requestRecordsPage();

    renderPage();

    expect(takeRecordsPageRequest()).toBe(false);
  });

  it("모두 보기에 있을 때 들어온 요청은 버려 랭킹 탭으로 돌아가도 다시 열리지 않는다", () => {
    renderPage();

    act(() => {
      requestRecordsPage();
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect(takeRecordsPageRequest()).toBe(false);
  });
});
