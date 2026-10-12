import type { RankingHomeResponse, RankingUnseenResponse } from "@focusmakers/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, type ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMemoryInterviewStore,
  recordLastHiddenAt,
  resetInterviewStore,
  setInterviewStore,
} from "@/features/interview/interviewStore";
import { hasShownNoticeThisLaunch, markNoticeShownThisLaunch } from "@/features/notice/noticeStore";
import {
  createMemoryBoardMemoryStore,
  resetBoardMemoryStore,
  setBoardMemoryStore,
  takeRecordsPageRequest,
} from "@/features/ranking/model/boardMemory";
import { markRecoveryShownThisLaunch } from "@/features/study-session/recoveryLaunchStore";
import type * as Amplitude from "@/lib/amplitude";
import { __resetRankingTabForTests } from "@/lib/rankingCapability";
import {
  FIXTURE_HOME_NONE,
  FIXTURE_HOME_OVERTAKEN,
  FIXTURE_UNSEEN_NONE,
  FIXTURE_UNSEEN_ONE,
} from "@/lib/rankingFixtures";

import { HomeRankingPopupHost } from "../HomeRankingPopupHost";

const rankingApi = vi.hoisted(() => ({
  getRankingRecordsUnseen: vi.fn(),
  getRankingHome: vi.fn(),
  postRankingRecordsSeen: vi.fn(),
}));
vi.mock("@/lib/rankingApi", () => rankingApi);

const startFocus = vi.hoisted(() => vi.fn());
vi.mock("@/features/onboarding/useFocusStart", () => ({ useFocusStart: () => startFocus }));

const analytics = vi.hoisted(() => ({
  trackRankingMedalModalShown: vi.fn(),
  trackRankingMedalModalAction: vi.fn(),
  trackRankingOvertakeShown: vi.fn(),
  trackRankingOvertakeAction: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  ...analytics,
}));

/** 마지막으로 앱이 가려진 시각이고 KST로 10월 11일 오후 11시다. */
const LAST_HIDDEN_AT = Date.parse("2026-10-11T14:00:00Z");
const OVERTAKE_TITLE = "자리 비운 사이 4명이 추월했어요";

let boardStore: ReturnType<typeof createMemoryBoardMemoryStore>;

beforeEach(() => {
  // 지금을 KST 10월 12일 오전 10시로 둔다.
  // 날짜만 고정해 쿼리 타이머는 그대로 돈다.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T01:00:00Z"));
  localStorage.clear();
  sessionStorage.clear();
  setInterviewStore(createMemoryInterviewStore({}, LAST_HIDDEN_AT));
  boardStore = createMemoryBoardMemoryStore();
  setBoardMemoryStore(boardStore);
  rankingApi.getRankingRecordsUnseen.mockResolvedValue(FIXTURE_UNSEEN_NONE);
  rankingApi.getRankingHome.mockResolvedValue(FIXTURE_HOME_OVERTAKEN);
  rankingApi.postRankingRecordsSeen.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  resetInterviewStore();
  resetBoardMemoryStore();
  Reflect.deleteProperty(document, "visibilityState");
  window.history.replaceState(null, "", "/");
  __resetRankingTabForTests();
});

function Probe() {
  const { pathname, search } = useLocation();
  return <p>{`${pathname}${search}`}</p>;
}

function renderHost({
  ready = true,
  blocked = false,
  strict = false,
}: { ready?: boolean; blocked?: boolean; strict?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  const wrap = (children: ReactNode) => (strict ? <StrictMode>{children}</StrictMode> : children);
  const tree = (isReady: boolean, isBlocked: boolean) =>
    wrap(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/home?userId=7"]}>
          <Routes>
            <Route
              path="/home"
              element={
                <HomeRankingPopupHost
                  userId={7}
                  ready={isReady}
                  blocked={isBlocked}
                  onOpenChange={onOpenChange}
                />
              }
            />
            <Route path="/ranking" element={<Probe />} />
            <Route path="/ranking/records" element={<Probe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  let current = { ready, blocked };
  const view = render(tree(ready, blocked));
  const update = (next: Partial<typeof current>) => {
    current = { ...current, ...next };
    view.rerender(tree(current.ready, current.blocked));
  };
  return {
    ...view,
    onOpenChange,
    setReady: (next: boolean) => update({ ready: next }),
    setBlocked: (next: boolean) => update({ blocked: next }),
  };
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

/** 판단이 쉬는 경로를 다 돌 때까지 기다린다. */
async function settle() {
  await waitFor(() => expect(rankingApi.getRankingRecordsUnseen).toHaveBeenCalled());
  await act(async () => {
    await Promise.resolve();
  });
}

describe("HomeRankingPopupHost: 메달 모달", () => {
  it("준비되기 전에는 묻지 않고, 준비되면 한 번 판단한다", async () => {
    const view = renderHost({ ready: false });
    await act(async () => {
      await Promise.resolve();
    });
    expect(rankingApi.getRankingRecordsUnseen).not.toHaveBeenCalled();

    view.setReady(true);

    await waitFor(() => expect(rankingApi.getRankingRecordsUnseen).toHaveBeenCalledTimes(1));
  });

  it("안 본 메달이 있으면 메달 모달을 띄우고 띄운 직후 본 것으로 보낸다", async () => {
    rankingApi.getRankingRecordsUnseen.mockResolvedValue(FIXTURE_UNSEEN_ONE);
    renderHost();

    expect(await screen.findByRole("dialog", { name: "1위로 마감했어요" })).toBeInTheDocument();
    expect(rankingApi.postRankingRecordsSeen).toHaveBeenCalledWith([41]);
    expect(analytics.trackRankingMedalModalShown).toHaveBeenCalledWith({
      count: 1,
      bestRank: 1,
      mixedPeriod: false,
    });
    expect(hasShownNoticeThisLaunch()).toBe(true);
    expect(localStorage.getItem("focuson.ranking.medalShownOn")).toBe("2026-10-12");
    // 메달이 있으면 추월은 묻지 않는다.
    expect(rankingApi.getRankingHome).not.toHaveBeenCalled();
  });

  it("StrictMode가 판단을 두 번 돌려도 모달과 본 것 보내기, 노출 이벤트는 한 번이다", async () => {
    rankingApi.getRankingRecordsUnseen.mockResolvedValue(FIXTURE_UNSEEN_ONE);
    renderHost({ strict: true });

    await screen.findByRole("dialog", { name: "1위로 마감했어요" });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(rankingApi.postRankingRecordsSeen).toHaveBeenCalledTimes(1);
    expect(analytics.trackRankingMedalModalShown).toHaveBeenCalledTimes(1);
  });

  it("본 것 표시가 실패해도 모달은 그대로 둔다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    rankingApi.getRankingRecordsUnseen.mockResolvedValue(FIXTURE_UNSEEN_ONE);
    rankingApi.postRankingRecordsSeen.mockRejectedValue(new Error("network"));
    renderHost();

    await screen.findByRole("dialog", { name: "1위로 마감했어요" });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("dialog", { name: "1위로 마감했어요" })).toBeInTheDocument();
  });

  it("브라우저에서 랭킹 기록 보기는 모두 보기로 가고 이벤트를 남긴다", async () => {
    rankingApi.getRankingRecordsUnseen.mockResolvedValue(FIXTURE_UNSEEN_ONE);
    renderHost();

    await userEvent.click(await screen.findByRole("button", { name: "랭킹 기록 보기" }));

    expect(await screen.findByText("/ranking/records?userId=7")).toBeInTheDocument();
    expect(analytics.trackRankingMedalModalAction).toHaveBeenCalledWith("records");
  });

  it("앱에서 랭킹 기록 보기는 모두 보기 요청을 남기고 랭킹 탭 전환을 맡긴다", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    window.history.replaceState(null, "", "/home?ranking=1");
    __resetRankingTabForTests();
    rankingApi.getRankingRecordsUnseen.mockResolvedValue(FIXTURE_UNSEEN_ONE);
    renderHost();

    await userEvent.click(await screen.findByRole("button", { name: "랭킹 기록 보기" }));

    expect(postMessage).toHaveBeenCalledWith(expect.stringContaining('"via":"top3_modal"'));
    expect(takeRecordsPageRequest()).toBe(true);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("닫기를 누르면 닫고 이벤트를 남긴다", async () => {
    rankingApi.getRankingRecordsUnseen.mockResolvedValue(FIXTURE_UNSEEN_ONE);
    renderHost();

    await userEvent.click(await screen.findByRole("button", { name: "닫기" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(analytics.trackRankingMedalModalAction).toHaveBeenCalledWith("close");
  });

  it("버튼을 연달아 눌러도 한 번만 처리한다", async () => {
    rankingApi.getRankingRecordsUnseen.mockResolvedValue(FIXTURE_UNSEEN_ONE);
    renderHost();
    const records = await screen.findByRole("button", { name: "랭킹 기록 보기" });

    act(() => {
      records.click();
      records.click();
    });

    expect(analytics.trackRankingMedalModalAction).toHaveBeenCalledTimes(1);
  });

  it("가려진 사이 도착한 메달 응답은 띄우지도 본 것으로 보내지도 않는다", async () => {
    let resolveUnseen: (value: RankingUnseenResponse) => void = () => {};
    rankingApi.getRankingRecordsUnseen.mockReturnValue(
      new Promise<RankingUnseenResponse>((resolve) => {
        resolveUnseen = resolve;
      }),
    );
    renderHost();
    await waitFor(() => expect(rankingApi.getRankingRecordsUnseen).toHaveBeenCalled());

    setVisibility("hidden");
    await act(async () => {
      resolveUnseen(FIXTURE_UNSEEN_ONE);
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(rankingApi.postRankingRecordsSeen).not.toHaveBeenCalled();
    expect(hasShownNoticeThisLaunch()).toBe(false);
  });

  it("메달 응답을 기다리는 사이 복구 창이 뜨면 띄우지도 본 것으로 보내지도 않는다", async () => {
    let resolveUnseen: (value: RankingUnseenResponse) => void = () => {};
    rankingApi.getRankingRecordsUnseen.mockReturnValue(
      new Promise<RankingUnseenResponse>((resolve) => {
        resolveUnseen = resolve;
      }),
    );
    renderHost();
    await waitFor(() => expect(rankingApi.getRankingRecordsUnseen).toHaveBeenCalled());

    // 늦게 온 복구 결과가 표시를 먼저 남긴 경우다.
    markRecoveryShownThisLaunch();
    await act(async () => {
      resolveUnseen(FIXTURE_UNSEEN_ONE);
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(rankingApi.postRankingRecordsSeen).not.toHaveBeenCalled();
    expect(hasShownNoticeThisLaunch()).toBe(false);
  });
});

describe("HomeRankingPopupHost: 홈과 주고받기", () => {
  it("팝업이 열리면 열렸다고, 닫히면 닫혔다고 알린다", async () => {
    rankingApi.getRankingRecordsUnseen.mockResolvedValue(FIXTURE_UNSEEN_ONE);
    const { onOpenChange } = renderHost();

    await screen.findByRole("dialog", { name: "1위로 마감했어요" });
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    await userEvent.click(screen.getByRole("button", { name: "닫기" }));

    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("이 문서에 다른 홈 팝업이 있었으면 묻지도 띄우지도 않는다", async () => {
    rankingApi.getRankingRecordsUnseen.mockResolvedValue(FIXTURE_UNSEEN_ONE);
    const { onOpenChange } = renderHost({ blocked: true });
    await act(async () => {
      await Promise.resolve();
    });

    expect(rankingApi.getRankingRecordsUnseen).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalledWith(true);
  });

  it("응답을 기다리는 사이 다른 홈 팝업이 생기면 띄우지도 본 것으로 보내지도 않는다", async () => {
    let resolveUnseen: (value: RankingUnseenResponse) => void = () => {};
    rankingApi.getRankingRecordsUnseen.mockReturnValue(
      new Promise<RankingUnseenResponse>((resolve) => {
        resolveUnseen = resolve;
      }),
    );
    const view = renderHost();
    await waitFor(() => expect(rankingApi.getRankingRecordsUnseen).toHaveBeenCalled());

    view.setBlocked(true);
    await act(async () => {
      resolveUnseen(FIXTURE_UNSEEN_ONE);
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(rankingApi.postRankingRecordsSeen).not.toHaveBeenCalled();
  });
});

describe("HomeRankingPopupHost: 추월 시트", () => {
  it("판단이 늦어져도 홈이 뜰 때의 숨김 시각으로 추월을 묻는다", async () => {
    const view = renderHost({ ready: false });
    // 판단을 기다리는 사이 앱을 잠깐 내렸다 올려 숨김 기록이 지금으로 바뀐 경우다.
    recordLastHiddenAt(Date.now());

    view.setReady(true);

    await screen.findByRole("dialog", { name: OVERTAKE_TITLE });
    expect(rankingApi.getRankingHome).toHaveBeenCalledWith(
      "2026-10-11T14:00:00.000Z",
      expect.any(AbortSignal),
    );
  });

  it("메달이 없으면 그날 첫 확인에 마지막으로 가려진 뒤의 추월을 묻고 시트를 띄운다", async () => {
    renderHost();

    expect(await screen.findByRole("dialog", { name: OVERTAKE_TITLE })).toBeInTheDocument();
    expect(rankingApi.getRankingHome).toHaveBeenCalledWith(
      "2026-10-11T14:00:00.000Z",
      expect.any(AbortSignal),
    );
    expect(analytics.trackRankingOvertakeShown).toHaveBeenCalledWith({
      count: 4,
      fromRank: 1201,
      toRank: 1205,
    });
    expect(localStorage.getItem("focuson.ranking.overtakeCheckedOn")).toBe("2026-10-12");
    expect(hasShownNoticeThisLaunch()).toBe(true);
  });

  it.each([["focuson.ranking.overtakeCheckedOn"], ["focuson.ranking.medalShownOn"]])(
    "%s가 오늘이면 추월을 묻지 않는다",
    async (key) => {
      localStorage.setItem(key, "2026-10-12");
      renderHost();

      await settle();

      expect(rankingApi.getRankingHome).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  it("마지막으로 가려진 시각이 없으면 묻지 않고 그날 확인한 것으로 적는다", async () => {
    setInterviewStore(createMemoryInterviewStore());
    renderHost();

    await waitFor(() =>
      expect(localStorage.getItem("focuson.ranking.overtakeCheckedOn")).toBe("2026-10-12"),
    );
    expect(rankingApi.getRankingHome).not.toHaveBeenCalled();
  });

  it("추월이 없으면 아무것도 띄우지 않는다", async () => {
    rankingApi.getRankingHome.mockResolvedValue(FIXTURE_HOME_NONE);
    renderHost();

    await waitFor(() => expect(rankingApi.getRankingHome).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(hasShownNoticeThisLaunch()).toBe(false);
  });

  it("공부하러 가기는 추월 출처로 집중 시작을 연다", async () => {
    renderHost();

    await userEvent.click(await screen.findByRole("button", { name: "공부하러 가기" }));

    expect(startFocus).toHaveBeenCalledWith("overtake_popup");
    expect(analytics.trackRankingOvertakeAction).toHaveBeenCalledWith("study");
  });

  it("랭킹 보기는 순공 주간 판을 넘겨주고 랭킹으로 간다", async () => {
    renderHost();

    await userEvent.click(await screen.findByRole("button", { name: "랭킹 보기" }));

    expect(await screen.findByText("/ranking?userId=7")).toBeInTheDocument();
    expect(JSON.parse(boardStore.raw!).ranking).toEqual({ type: "FOCUS_TIME", period: "WEEKLY" });
    expect(analytics.trackRankingOvertakeAction).toHaveBeenCalledWith("ranking");
  });

  it("닫은 추월 시트는 같은 날 새 실행에도 다시 띄우지 않는다", async () => {
    const first = renderHost();
    await screen.findByRole("dialog", { name: OVERTAKE_TITLE });

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(analytics.trackRankingOvertakeAction).toHaveBeenCalledWith("close");

    first.unmount();
    sessionStorage.clear();
    renderHost();
    await settle();

    expect(rankingApi.getRankingHome).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    ["앱이 가려지면", () => setVisibility("hidden")],
    ["복구 창이 뜨면", markRecoveryShownThisLaunch],
  ])("추월 응답을 기다리는 사이 %s 시트를 띄우지 않는다", async (_, interrupt) => {
    let resolveHome: (value: RankingHomeResponse) => void = () => {};
    rankingApi.getRankingHome.mockReturnValue(
      new Promise<RankingHomeResponse>((resolve) => {
        resolveHome = resolve;
      }),
    );
    renderHost();
    await waitFor(() => expect(rankingApi.getRankingHome).toHaveBeenCalled());

    interrupt();
    await act(async () => {
      resolveHome(FIXTURE_HOME_OVERTAKEN);
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(analytics.trackRankingOvertakeShown).not.toHaveBeenCalled();
    expect(hasShownNoticeThisLaunch()).toBe(false);
  });
});

describe("HomeRankingPopupHost: 쉬는 실행", () => {
  it.each([
    ["공지나 인터뷰", markNoticeShownThisLaunch],
    ["복구 창", markRecoveryShownThisLaunch],
  ])("이번 실행에 %s가 떴으면 묻지 않는다", async (_, mark) => {
    mark();
    renderHost();

    await act(async () => {
      await Promise.resolve();
    });

    expect(rankingApi.getRankingRecordsUnseen).not.toHaveBeenCalled();
  });

  it("랭킹 탭이 없는 앱이면 묻지 않는다", async () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage: vi.fn() });
    __resetRankingTabForTests();
    renderHost();

    await act(async () => {
      await Promise.resolve();
    });

    expect(rankingApi.getRankingRecordsUnseen).not.toHaveBeenCalled();
  });

  it("메달 요청이 실패하면 추월도 묻지 않고 아무것도 띄우지 않는다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    rankingApi.getRankingRecordsUnseen.mockRejectedValue(new Error("network"));
    renderHost();

    await settle();

    expect(rankingApi.getRankingHome).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("추월 요청이 실패해도 아무것도 띄우지 않는다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    rankingApi.getRankingHome.mockRejectedValue(new Error("network"));
    renderHost();

    await waitFor(() => expect(rankingApi.getRankingHome).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
