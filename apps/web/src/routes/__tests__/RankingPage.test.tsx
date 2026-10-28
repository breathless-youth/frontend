import type { RankingBoardResponse, RankingRecordsSummary } from "@focusmakers/types";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMemoryBoardMemoryStore,
  requestBoard,
  requestRecordsPage,
  resetBoardMemoryStore,
  setBoardMemoryStore,
  takeRecordsPageRequest,
} from "@/features/ranking/model/boardMemory";
import type * as Amplitude from "@/lib/amplitude";
import {
  getRankingBoard,
  getRankingRecordsSummary,
  type RankingBoardParams,
} from "@/lib/rankingApi";
import {
  FIXTURE_FOCUS_WEEKLY,
  FIXTURE_RATE_WEEKLY,
  FIXTURE_RESET_DAILY,
  FIXTURE_RESET_PREVIOUS,
  FIXTURE_SLOT_DAILY,
  FIXTURE_SUMMARY,
  FIXTURE_TOTAL_DAYS,
} from "@/lib/rankingFixtures";
import { rankingKeys } from "@/lib/rankingQueries";
import { useUserId } from "@/lib/userId";
import type * as UserId from "@/lib/userId";
import { RankingPage } from "@/routes/RankingPage";

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
  trackRankingBoardViewed: vi.fn(),
  trackRankingRecordsOpened: vi.fn(),
  trackRankingRecordTapped: vi.fn(),
  trackFocusStartTapped: vi.fn(),
  trackErrorRetryPressed: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  ...analytics,
}));

function byParams(params: RankingBoardParams): RankingBoardResponse {
  switch (params.type) {
    case "FOCUS_RATE":
      return FIXTURE_RATE_WEEKLY;
    case "TIME_SLOT":
      return { ...FIXTURE_SLOT_DAILY, slot: params.slot ?? "MORNING" };
    default:
      return { ...FIXTURE_FOCUS_WEEKLY, period: params.period ?? "WEEKLY" };
  }
}

function paragraph(text: string) {
  return screen.getByText((_, element) => element?.tagName === "P" && element.textContent === text);
}

let store: ReturnType<typeof createMemoryBoardMemoryStore>;

// 시트는 나눠 받는다. 전체 스위트 부하에서는 첫 열기의 시트 모듈 받기가 findBy 기본 1초를 넘겨 미리 받아 둔다.
beforeAll(async () => {
  await import("@/features/ranking/components/RecordsSheet");
});

beforeEach(() => {
  store = createMemoryBoardMemoryStore();
  setBoardMemoryStore(store);
  vi.mocked(getRankingBoard).mockImplementation(async (params) => byParams(params));
  vi.mocked(getRankingRecordsSummary).mockResolvedValue(FIXTURE_SUMMARY);
});

afterEach(() => {
  // 화면을 먼저 내린다.
  // 그대로 두면 아래 포커스 초기화가 아직 붙어 있는 화면에 기억을 다시 읽게 해 act 경고가 난다.
  cleanup();
  resetBoardMemoryStore();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.clearAllMocks();
});

/** 지금 시작하면 받을 순위가 3위 안이라 리셋 카드가 그 순위를 말하는 판. */
const RESET_IN_TOP3 = { ...FIXTURE_RESET_DAILY, startNowRank: 3 };

function renderPage(seed?: (client: QueryClient) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(client);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/ranking?userId=7"]}>
        <Routes>
          <Route path="/ranking" element={<RankingPage />} />
          <Route path="/ranking/records" element={<p>모두 보기 화면</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

describe("RankingPage", () => {
  it("처음 열면 순공 일간 판을 받아 바로 위까지 남은 시간을 보인다", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "오늘 TOP 3" })).toBeInTheDocument();
    expect(getRankingBoard).toHaveBeenCalledWith(
      { type: "FOCUS_TIME", period: "DAILY" },
      expect.any(AbortSignal),
    );
    expect(paragraph("다음 순위까지 22분")).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "순공 · 일간" });
    expect(within(card).queryByText("커피세잔", { exact: false })).toBeNull();
    expect(screen.getAllByRole("listitem", { current: true })[0]).toHaveTextContent("오늘도출석");
  });

  it("종목을 바꾸면 그 판을 받고 기억에 적는다", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "오늘 TOP 3" });

    await userEvent.click(screen.getByRole("tab", { name: "집중률" }));

    expect(await screen.findByRole("heading", { name: "집중률 TOP 3" })).toBeInTheDocument();
    expect(JSON.parse(store.raw!).ranking).toEqual({ type: "FOCUS_RATE", period: "WEEKLY" });
  });

  it("집중률 판 카드는 분 없이 따라잡을 수 있다고 말한다", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "오늘 TOP 3" });

    await userEvent.click(screen.getByRole("tab", { name: "집중률" }));

    await screen.findByRole("heading", { name: "집중률 TOP 3" });
    const card = screen.getByRole("region", { name: "집중률 · 주간" });
    expect(
      within(card).getByText(
        (_, element) =>
          element?.tagName === "P" && element.textContent === "조금만 더 집중하면 따라잡아요",
      ),
    ).toBeInTheDocument();
  });

  it("다른 화면이 넘겨준 판은 다시 보일 때 연다", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "오늘 TOP 3" });

    act(() => {
      requestBoard({ type: "TIME_SLOT", period: "DAILY", slot: "EVENING" });
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect(await screen.findByRole("heading", { name: "저녁 구간 TOP 3" })).toBeInTheDocument();
  });

  it("다른 화면이 모두 보기를 요청해 두었으면 열 때 모두 보기로 간다", async () => {
    requestRecordsPage();

    renderPage();

    expect(await screen.findByText("모두 보기 화면")).toBeInTheDocument();
    expect(takeRecordsPageRequest()).toBe(false);
  });

  it("다시 보일 때 모두 보기 요청이 있으면 한 번만 연다", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "오늘 TOP 3" });

    act(() => {
      requestRecordsPage();
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect(await screen.findByText("모두 보기 화면")).toBeInTheDocument();
    expect(takeRecordsPageRequest()).toBe(false);
  });

  it("내 순위가 없고 직전 기간에 있었으면 리셋 카드와 직전 결과를 보이고 기록 보기로 간다", async () => {
    vi.mocked(getRankingBoard).mockImplementation(async (params) =>
      params.offset === -1 ? FIXTURE_RESET_PREVIOUS : RESET_IN_TOP3,
    );
    renderPage();

    expect(await screen.findByText("지금 시작하면", { exact: false })).toHaveTextContent(
      "지금 시작하면 3위",
    );
    expect(screen.getByRole("region", { name: "어제 최종 결과" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "기록 보기 ›" }));
    expect(await screen.findByText("모두 보기 화면")).toBeInTheDocument();
  });

  it("판을 처음 그리면 판 보기 이벤트를 한 번 보낸다", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "오늘 TOP 3" });

    expect(analytics.trackRankingBoardViewed).toHaveBeenCalledTimes(1);
    expect(analytics.trackRankingBoardViewed).toHaveBeenCalledWith({
      type: "FOCUS_TIME",
      period: "DAILY",
      slot: null,
      state: "ranked",
    });
  });

  it("불러오지 못하면 다시 시도로 다시 받는다", async () => {
    vi.mocked(getRankingBoard).mockRejectedValueOnce(new Error("down"));
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "다시 시도" }));

    expect(await screen.findByRole("heading", { name: "오늘 TOP 3" })).toBeInTheDocument();
  });

  it("받은 적 없는 판을 오프라인에서 열면 오류와 다시 시도를 보이고, 연결되면 판을 그린다", async () => {
    onlineManager.setOnline(false);
    renderPage();

    expect(await screen.findByText("랭킹을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    expect(getRankingBoard).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));

    expect(await screen.findByRole("heading", { name: "오늘 TOP 3" })).toBeInTheDocument();
    expect(screen.queryByText("랭킹을 불러오지 못했어요")).toBeNull();
  });

  it("판은 있고 직전 기간을 오프라인이라 못 받으면 직전 결과 없이 화면을 그리고, 연결되면 리셋 카드로 바꾼다", async () => {
    vi.mocked(getRankingBoard).mockImplementation(async (params) =>
      params.offset === -1 ? FIXTURE_RESET_PREVIOUS : RESET_IN_TOP3,
    );
    onlineManager.setOnline(false);
    renderPage((client) =>
      client.setQueryData(
        rankingKeys.board(7, { type: "FOCUS_TIME", period: "DAILY" }),
        RESET_IN_TOP3,
      ),
    );

    expect(await screen.findByText("아직 내 순위가 없어요")).toBeInTheDocument();
    expect(getRankingBoard).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));

    expect(await screen.findByText("지금 시작하면", { exact: false })).toHaveTextContent(
      "지금 시작하면 3위",
    );
    expect(screen.getByRole("region", { name: "어제 최종 결과" })).toBeInTheDocument();
  });

  it("폴링이 한 번 실패해도 받아 둔 판을 그대로 보인다", async () => {
    const client = renderPage();
    await screen.findByRole("heading", { name: "오늘 TOP 3" });
    vi.mocked(getRankingBoard).mockRejectedValueOnce(new Error("down"));

    await act(async () => {
      await client.refetchQueries({ queryKey: ["ranking", "board"] });
      // react-query는 상태 변경 알림을 다음 틱에 묶어 보내므로 한 틱 더 기다려야 화면에 반영된다.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(
      client.getQueryState(rankingKeys.board(7, { type: "FOCUS_TIME", period: "DAILY" }))?.status,
    ).toBe("error");
    expect(screen.getByRole("heading", { name: "오늘 TOP 3" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
  });

  it("가려진 동안 바꾼 판은 판 보기 이벤트를 보내지 않고, 다시 보이면 한 번 보낸다", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "오늘 TOP 3" });
    act(() => focusManager.setFocused(false));

    await userEvent.click(screen.getByRole("tab", { name: "집중률" }));
    await screen.findByRole("heading", { name: "집중률 TOP 3" });

    expect(analytics.trackRankingBoardViewed).toHaveBeenCalledTimes(1);
    expect(analytics.trackRankingBoardViewed).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "FOCUS_RATE" }),
    );

    act(() => focusManager.setFocused(true));

    expect(analytics.trackRankingBoardViewed).toHaveBeenCalledTimes(2);
    expect(analytics.trackRankingBoardViewed).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "FOCUS_RATE", period: "WEEKLY" }),
    );
  });

  it("지금 구간 표시는 기기 시각이 아니라 서버 시각을 따른다", async () => {
    // 기기는 저녁(19시 30분)이고 서버 응답 시각은 점심(14시 12분)이다.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T10:30:00Z"));
    try {
      renderPage();
      await screen.findByRole("heading", { name: "오늘 TOP 3" });

      await userEvent.click(screen.getByRole("tab", { name: "시간대" }));
      await screen.findByRole("heading", { name: "아침 구간 TOP 3" });

      expect(screen.getByRole("radio", { name: "점심 12–18시, 지금 구간" })).toBeInTheDocument();
      expect(screen.queryByRole("radio", { name: "저녁 18–24시, 지금 구간" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("기기 등록 전이면 안내만 보인다", () => {
    vi.mocked(useUserId).mockReturnValueOnce(null);
    renderPage();

    expect(screen.getByText("기기 등록 전이에요. 앱에서 열면 기록이 저장돼요")).toBeInTheDocument();
    expect(getRankingBoard).not.toHaveBeenCalled();
  });

  it("메달 버튼으로 기록 시트를 열고, 메달을 누르면 그 판으로 바꾸고 닫는다", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "랭킹 기록, 메달 18개" }));
    expect(analytics.trackRankingRecordsOpened).toHaveBeenCalledWith(18);

    await userEvent.click(
      await screen.findByRole("button", { name: "1위 아침 구간 일간 · 10월 9일 3:04:20" }),
    );

    expect(await screen.findByRole("heading", { name: "아침 구간 TOP 3" })).toBeInTheDocument();
    expect(analytics.trackRankingRecordTapped).toHaveBeenCalledWith({
      rank: 1,
      type: "TIME_SLOT",
      period: "DAILY",
      from: "sheet",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("기록 시트를 열면 신선한 요약도 한 번 더 받고, 받는 동안 받아 둔 기록을 보인다", async () => {
    renderPage();
    const medal = await screen.findByRole("button", { name: "랭킹 기록, 메달 18개" });
    expect(getRankingRecordsSummary).toHaveBeenCalledTimes(1);
    let resolveSummary: ((value: RankingRecordsSummary) => void) | undefined;
    vi.mocked(getRankingRecordsSummary).mockReturnValueOnce(
      new Promise<RankingRecordsSummary>((resolve) => {
        resolveSummary = resolve;
      }),
    );

    await userEvent.click(medal);

    expect(getRankingRecordsSummary).toHaveBeenCalledTimes(2);
    const sheet = await screen.findByRole("dialog", { name: "랭킹 기록" });
    expect(within(sheet).getByText("모두 18번")).toBeInTheDocument();
    expect(within(sheet).queryByRole("status")).toBeNull();

    await act(async () => {
      resolveSummary?.({ ...FIXTURE_SUMMARY, total: 19 });
    });

    expect(await within(sheet).findByText("모두 19번")).toBeInTheDocument();
  });

  describe("누적 일수 판", () => {
    function openTotalDays(board: RankingBoardResponse) {
      store.write(
        JSON.stringify({
          active: "hall",
          ranking: { type: "FOCUS_TIME", period: "WEEKLY" },
          hall: { type: "TOTAL_DAYS" },
        }),
      );
      vi.mocked(getRankingBoard).mockResolvedValue(board);
      renderPage();
    }

    it("같은 일수 묶음 목록을 보이고 한 사람씩인 목록은 두지 않는다", async () => {
      openTotalDays(FIXTURE_TOTAL_DAYS);

      const list = await screen.findByRole("region", { name: "내 주변 누적 일수 순위" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(5);
      expect(within(list).getByRole("listitem", { current: true })).toHaveTextContent(
        "1,530오늘도출석 외 7명64일",
      );
      expect(screen.queryByRole("region", { name: "내 주변 순위" })).toBeNull();
    });

    it("다른 사람과 같은 일수로 공동 1위면 1위 지키는 중 카드와 내 묶음부터 3묶음을 보인다", async () => {
      const [top, ...rest] = FIXTURE_TOTAL_DAYS.podiumGroups!;
      const podium = [{ ...top!, nickname: "오늘도출석", me: true, myOrder: 2 }, ...rest];
      // 서버는 내 묶음이 맨 앞이면 뒤 4묶음을 더 보낸다.
      const around = [
        ...podium,
        { ...rest[1]!, days: 340, rank: 7, nickname: "형광펜", othersCount: 0 },
        { ...rest[1]!, days: 333, rank: 8, nickname: "커피세잔", othersCount: 2 },
      ];
      openTotalDays({
        ...FIXTURE_TOTAL_DAYS,
        me: { rank: 1, value: 412, focusing: false, topPercent: 1 },
        above: null,
        below: { nickname: "합격기원", gap: 24, focusing: false },
        nextTier: null,
        podiumGroups: podium,
        aroundGroups: around,
      });

      const list = await screen.findByRole("region", { name: "내 주변 누적 일수 순위" });
      expect(paragraph("1위 지키는 중")).toBeInTheDocument();
      const items = within(list).getAllByRole("listitem");
      expect(items).toHaveLength(3);
      expect(items[0]).toHaveAttribute("aria-current", "true");
      expect(items[0]).toHaveTextContent("1오늘도출석 외 2명412일");
      expect(items[2]).toHaveTextContent("5공시생J 외 1명351일");
      expect(screen.queryByRole("region", { name: "내 주변 순위" })).toBeNull();
    });

    it("묶음이 오지 않으면 around에 사람이 있어도 한 사람씩인 목록 대신 빈 묶음 목록을 둔다", async () => {
      openTotalDays({
        ...FIXTURE_TOTAL_DAYS,
        aroundGroups: null,
        around: [{ rank: 1530, nickname: "오늘도출석", value: 64, focusing: false, me: true }],
      });

      const list = await screen.findByRole("region", { name: "내 주변 누적 일수 순위" });
      expect(within(list).queryAllByRole("listitem")).toHaveLength(0);
      expect(screen.queryByRole("region", { name: "내 주변 순위" })).toBeNull();
      expect(screen.queryByText("오늘도출석")).toBeNull();
    });
  });
});
