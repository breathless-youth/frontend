import type { NoticeResponse } from "@focusmakers/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMemoryInterviewStore,
  loadInterviewState,
  resetInterviewStore,
  setInterviewStore,
} from "@/features/interview/interviewStore";
import type * as InterviewForm from "@/features/interview/interviewForm";
import type * as Amplitude from "@/lib/amplitude";

import { NoticeModalHost } from "../NoticeModalHost";

const getActiveNotices = vi.hoisted(() => vi.fn());
vi.mock("@/lib/noticeApi", () => ({ getActiveNotices }));
const openInterviewForm = vi.hoisted(() => vi.fn());
vi.mock("@/features/interview/interviewForm", async (o) => ({
  ...(await o<typeof InterviewForm>()),
  openInterviewForm,
}));
const analytics = vi.hoisted(() => ({
  trackInterviewShown: vi.fn(),
  trackInterviewClicked: vi.fn(),
  trackInterviewDismissed: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (o) => ({ ...(await o<typeof Amplitude>()), ...analytics }));

const NOW = new Date(2026, 9, 6, 9, 0).getTime();

function notice(id: number, audience: NoticeResponse["audience"]): NoticeResponse {
  return {
    id,
    title: `공지${id}`,
    content: "c",
    imageUrl: null,
    audience,
    badgeText: null,
    buttonText: "인터뷰 신청하기",
    buttonUrl: "https://docs.google.com/forms/d/e/a/viewform?entry.1=NICKNAME",
  };
}

function renderHost({ paused = false }: { paused?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSettled = vi.fn();
  const tree = (nextPaused: boolean) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/home?userId=7"]}>
        <NoticeModalHost userId={7} paused={nextPaused} onSettled={onSettled} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const result = render(tree(paused));
  return { ...result, onSettled, setPaused: (next: boolean) => result.rerender(tree(next)) };
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  // 재방문 상태: 1시간 전에 떠남
  setInterviewStore(createMemoryInterviewStore({}, NOW - 60 * 60 * 1000));
});

afterEach(() => {
  vi.useRealTimers();
  setVisibility("visible");
  resetInterviewStore();
  sessionStorage.clear();
  localStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("NoticeModalHost", () => {
  it("인터뷰 공지를 띄우고 노출을 기록한다", async () => {
    getActiveNotices.mockResolvedValue([notice(1, "G1_NOT_STARTED")]);
    renderHost();

    expect(await screen.findByRole("dialog", { name: "공지1" })).toBeInTheDocument();
    expect(loadInterviewState()?.modalCount).toBe(1);
    expect(analytics.trackInterviewShown).toHaveBeenCalledWith({
      source: "g1_revisit",
      exposure: 1,
    });
  });

  it("일반 공지가 있으면 그것만 띄운다", async () => {
    getActiveNotices.mockResolvedValue([notice(2, "G2_LAPSED"), notice(1, "ALL")]);
    renderHost();

    expect(await screen.findByRole("dialog", { name: "공지1" })).toBeInTheDocument();
    expect(loadInterviewState()?.modalCount).toBe(0);
  });

  it("같은 실행에서 이미 띄웠으면 다시 열린 문서에서는 조회도 하지 않는다", async () => {
    sessionStorage.setItem("focuson.notice.shownThisLaunch", "1");
    getActiveNotices.mockResolvedValue([notice(1, "ALL")]);
    renderHost();
    document.dispatchEvent(new Event("visibilitychange"));

    await Promise.resolve();
    expect(getActiveNotices).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("공지를 띄운 뒤 홈이 다시 보이면 다시 조회하지 않는다", async () => {
    getActiveNotices.mockResolvedValue([notice(1, "ALL")]);
    renderHost();
    fireEvent.click(await screen.findByRole("button", { name: "닫기" }));

    document.dispatchEvent(new Event("visibilitychange"));

    await Promise.resolve();
    expect(getActiveNotices).toHaveBeenCalledTimes(1);
  });

  it("인터뷰 신청을 누르면 신청으로 남기고 폼을 연다", async () => {
    getActiveNotices.mockResolvedValue([notice(1, "G2_LAPSED")]);
    renderHost();

    fireEvent.click(await screen.findByRole("button", { name: "인터뷰 신청하기" }));

    expect(loadInterviewState()?.applied).toBe(true);
    expect(analytics.trackInterviewClicked).toHaveBeenCalledWith({
      source: "g2_return",
      exposure: 1,
    });
    expect(openInterviewForm).toHaveBeenCalledWith(notice(1, "G2_LAPSED").buttonUrl, "?userId=7");
  });

  it("인터뷰 다시 보지 않기는 모달만 멈춘다", async () => {
    getActiveNotices.mockResolvedValue([notice(1, "G2_LAPSED")]);
    renderHost();

    fireEvent.click(await screen.findByRole("button", { name: "다시 보지 않기" }));

    expect(loadInterviewState()?.modalNeverAgain).toBe(true);
    expect(analytics.trackInterviewDismissed).toHaveBeenCalledWith({
      source: "g2_return",
      exposure: 1,
      action: "never_again",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("일반 공지 다시 보지 않기는 공지 id를 남긴다", async () => {
    getActiveNotices.mockResolvedValue([notice(9, "ALL")]);
    renderHost();

    fireEvent.click(await screen.findByRole("button", { name: "다시 보지 않기" }));

    expect(localStorage.getItem("focuson.noticeDismissed.9")).toBe("1");
    expect(analytics.trackInterviewDismissed).not.toHaveBeenCalled();
  });

  it("일반 공지는 링크가 있어도 본 버튼을 그리지 않는다", async () => {
    getActiveNotices.mockResolvedValue([{ ...notice(9, "ALL"), buttonUrl: "/records" }]);
    renderHost();

    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: "인터뷰 신청하기" })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("조회가 실패하면 아무것도 띄우지 않는다", async () => {
    getActiveNotices.mockRejectedValue(new Error("x"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    renderHost();

    await waitFor(() => expect(getActiveNotices).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("이번 실행 기록을 저장하지 못해도 같은 문서에서는 다시 띄우지 않는다", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    getActiveNotices.mockResolvedValue([notice(1, "ALL")]);
    renderHost();
    fireEvent.click(await screen.findByRole("button", { name: "닫기" }));

    document.dispatchEvent(new Event("visibilitychange"));

    await Promise.resolve();
    expect(getActiveNotices).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("인터뷰 닫기는 닫기로 남긴다", async () => {
    getActiveNotices.mockResolvedValue([notice(1, "G2_LAPSED")]);
    renderHost();

    fireEvent.click(await screen.findByRole("button", { name: "닫기" }));

    expect(analytics.trackInterviewDismissed).toHaveBeenCalledWith({
      source: "g2_return",
      exposure: 1,
      action: "close",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("공지를 띄우면 이번 실행을 사용한 것으로 남긴다", async () => {
    getActiveNotices.mockResolvedValue([notice(1, "ALL")]);
    renderHost();

    await screen.findByRole("dialog");
    expect(sessionStorage.getItem("focuson.notice.shownThisLaunch")).toBe("1");
  });

  it("홈이 다시 보이면 공지를 새로 조회한다", async () => {
    getActiveNotices.mockResolvedValue([]);
    renderHost();
    await waitFor(() => expect(getActiveNotices).toHaveBeenCalledTimes(1));

    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(getActiveNotices).toHaveBeenCalledTimes(2));
  });
  it("띄울 공지가 없으면 정리됐다고 알린다", async () => {
    getActiveNotices.mockResolvedValue([]);
    const { onSettled } = renderHost();

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
  });

  it("조회가 실패해도 정리됐다고 알린다", async () => {
    getActiveNotices.mockRejectedValue(new Error("x"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { onSettled } = renderHost();

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
  });

  it("이번 실행에 이미 띄웠으면 바로 정리됐다고 알린다", async () => {
    sessionStorage.setItem("focuson.notice.shownThisLaunch", "1");
    const { onSettled } = renderHost();

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
  });

  it("띄운 공지가 닫힌 뒤에야 정리됐다고 알리고, 한 번만 알린다", async () => {
    getActiveNotices.mockResolvedValue([notice(1, "G2_LAPSED")]);
    const { onSettled } = renderHost();
    await screen.findByRole("dialog");
    expect(onSettled).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    document.dispatchEvent(new Event("visibilitychange"));

    await Promise.resolve();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("일반 공지 다시 보지 않기로 닫아도 정리됐다고 알린다", async () => {
    getActiveNotices.mockResolvedValue([notice(9, "ALL")]);
    const { onSettled } = renderHost();

    fireEvent.click(await screen.findByRole("button", { name: "다시 보지 않기" }));

    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("인터뷰 신청으로 닫아도 정리됐다고 알린다", async () => {
    getActiveNotices.mockResolvedValue([notice(1, "G2_LAPSED")]);
    const { onSettled } = renderHost();

    fireEvent.click(await screen.findByRole("button", { name: "인터뷰 신청하기" }));

    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("멈춘 동안에는 공지를 띄우지도 기록하지도 않는다", async () => {
    getActiveNotices.mockResolvedValue([notice(1, "G1_NOT_STARTED")]);
    renderHost({ paused: true });
    document.dispatchEvent(new Event("visibilitychange"));

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(loadInterviewState()?.modalCount).toBe(0);
    expect(analytics.trackInterviewShown).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("focuson.notice.shownThisLaunch")).toBeNull();
  });

  it("조회 중에 홈이 가려지면 응답으로 아무것도 띄우거나 남기지 않고, 다시 보일 때 정한다", async () => {
    let resolveNotices: (value: NoticeResponse[]) => void = () => {};
    getActiveNotices.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveNotices = resolve;
      }),
    );
    const { onSettled } = renderHost();
    await waitFor(() => expect(getActiveNotices).toHaveBeenCalledTimes(1));

    setVisibility("hidden");
    await act(async () => resolveNotices([notice(1, "G1_NOT_STARTED")]));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(loadInterviewState()?.modalCount).toBe(0);
    expect(analytics.trackInterviewShown).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("focuson.notice.shownThisLaunch")).toBeNull();
    expect(onSettled).not.toHaveBeenCalled();

    getActiveNotices.mockResolvedValue([notice(1, "G1_NOT_STARTED")]);
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(await screen.findByRole("dialog", { name: "공지1" })).toBeInTheDocument();
    expect(loadInterviewState()?.modalCount).toBe(1);
  });

  it("공지가 떠 있는 동안 홈이 다시 보여도 정리됐다고 알리지 않는다", async () => {
    getActiveNotices.mockResolvedValue([notice(1, "G2_LAPSED")]);
    const { onSettled } = renderHost();
    await screen.findByRole("dialog");

    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => {
      await Promise.resolve();
    });

    expect(onSettled).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("조회가 3초 안에 끝나지 않으면 정리됐다고 알리고, 멈춘 사이 늦게 온 공지는 띄우지 않는다", async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(NOW);
    let resolveNotices: (value: NoticeResponse[]) => void = () => {};
    getActiveNotices.mockReturnValue(
      new Promise((resolve) => {
        resolveNotices = resolve;
      }),
    );
    const { onSettled, setPaused } = renderHost();

    act(() => vi.advanceTimersByTime(2999));
    expect(onSettled).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onSettled).toHaveBeenCalledTimes(1);

    setPaused(true);
    await act(async () => resolveNotices([notice(1, "G1_NOT_STARTED")]));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(loadInterviewState()?.modalCount).toBe(0);
    expect(sessionStorage.getItem("focuson.notice.shownThisLaunch")).toBeNull();
  });

  it("공지를 띄웠으면 3초가 지나도 닫기 전에는 정리됐다고 알리지 않는다", async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(NOW);
    getActiveNotices.mockResolvedValue([notice(1, "ALL")]);
    const { onSettled } = renderHost();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(5000));

    expect(onSettled).not.toHaveBeenCalled();
  });

  it("3초 마감으로 정리한 뒤 같은 조회의 늦은 응답은 버리고, 다음에 보일 때 다시 정한다", async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(NOW);
    let resolveNotices: (value: NoticeResponse[]) => void = () => {};
    getActiveNotices.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveNotices = resolve;
      }),
    );
    const { onSettled } = renderHost();
    act(() => vi.advanceTimersByTime(3000));
    expect(onSettled).toHaveBeenCalledTimes(1);

    await act(async () => resolveNotices([notice(1, "G1_NOT_STARTED")]));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(loadInterviewState()?.modalCount).toBe(0);
    expect(analytics.trackInterviewShown).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("focuson.notice.shownThisLaunch")).toBeNull();

    getActiveNotices.mockResolvedValue([notice(1, "G1_NOT_STARTED")]);
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("dialog", { name: "공지1" })).toBeInTheDocument();
  });
});
