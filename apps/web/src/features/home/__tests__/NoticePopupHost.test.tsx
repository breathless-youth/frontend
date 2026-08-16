import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMemoryNoticeDismissStore,
  resetNoticeDismissStore,
  setNoticeDismissStore,
  type NoticeDismissStore,
} from "../notice";
import { NoticePopupHost } from "../NoticePopupHost";

/**
 * U2 공지 팝업의 **트리거 지점** (스펙 §4.3). 조회(react-query)→게이트 판정→닫기 동선 배선을
 * 실제 게이트 모듈 그대로 검증한다 — mock은 네트워크(fetch)와 dismiss 저장소뿐이다.
 */

const mockedFetch = vi.fn();
globalThis.fetch = mockedFetch as unknown as typeof fetch;

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const NOTICE = {
  id: 11,
  title: "새 기능이 나왔어요",
  content: "이제 종일룸에서 친구와 함께 공부할 수 있어요.",
  imageUrl: null,
};

let store: NoticeDismissStore;

beforeEach(() => {
  vi.clearAllMocks();
  store = createMemoryNoticeDismissStore();
  setNoticeDismissStore(store);
});

afterEach(() => {
  resetNoticeDismissStore();
  localStorage.clear();
});

function renderHost() {
  const onFinished = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NoticePopupHost onFinished={onFinished} />
    </QueryClientProvider>,
  );
  return { onFinished };
}

describe("NoticePopupHost", () => {
  it("활성 공지가 있으면 팝업을 띄운다 — 떠 있는 동안 onFinished를 부르지 않는다", async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse(200, [NOTICE]));

    const { onFinished } = renderHost();

    expect(await screen.findByText(NOTICE.title)).toBeInTheDocument();
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("활성 공지가 없으면 아무것도 렌더하지 않고 onFinished를 알린다", async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse(200, []));

    const { onFinished } = renderHost();

    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("notice-popup")).not.toBeInTheDocument();
  });

  it("조회가 실패하면 console.warn만 남기고 띄우지 않으며 onFinished를 알린다 — fail-closed (결정 6)", async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse(500, { message: "서버 오류" }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { onFinished } = renderHost();

    await waitFor(() => expect(warn).toHaveBeenCalled());
    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("notice-popup")).not.toBeInTheDocument();
    warn.mockRestore();
  });

  it("확인은 이번 방문만 닫는다 — dismiss를 저장하지 않고 onFinished를 알린다 (결정 4)", async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse(200, [NOTICE]));
    const { onFinished } = renderHost();
    await screen.findByText(NOTICE.title);

    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    expect(screen.queryByTestId("notice-popup")).not.toBeInTheDocument();
    expect(onFinished).toHaveBeenCalledTimes(1);
    await expect(store.isDismissed(NOTICE.id)).resolves.toBe(false);
  });

  it("X도 이번 방문만 닫는다 — dismiss를 저장하지 않는다 (결정 4)", async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse(200, [NOTICE]));
    renderHost();
    await screen.findByText(NOTICE.title);

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));

    expect(screen.queryByTestId("notice-popup")).not.toBeInTheDocument();
    await expect(store.isDismissed(NOTICE.id)).resolves.toBe(false);
  });

  it("다시 보지 않기는 닫고 해당 공지를 영구 dismiss한다", async () => {
    mockedFetch.mockResolvedValueOnce(jsonResponse(200, [NOTICE]));
    renderHost();
    await screen.findByText(NOTICE.title);

    fireEvent.click(screen.getByRole("button", { name: "다시 보지 않기" }));

    expect(screen.queryByTestId("notice-popup")).not.toBeInTheDocument();
    await waitFor(() => expect(store.isDismissed(NOTICE.id)).resolves.toBe(true));
  });
});
