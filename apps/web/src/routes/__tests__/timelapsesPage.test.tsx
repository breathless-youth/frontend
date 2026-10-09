import "fake-indexeddb/auto";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { DEFAULT_TIMELAPSE_SETTINGS } from "@/features/timelapse/timelapseSettings";
import type { TimelapseStore } from "@/features/timelapse/timelapseStore";
import { createIndexedDbTimelapseStore } from "@/features/timelapse/timelapseStore";
import type * as TimelapseVideo from "@/features/timelapse/timelapseVideo";
import { queryClient as appQueryClient } from "@/lib/queryClient";
import { showToast } from "@/lib/toast";
import { TimelapsesPage } from "@/routes/TimelapsesPage";

vi.mock("@/lib/toast", () => ({ showToast: vi.fn(), dismissToast: vi.fn() }));
vi.mock("@/features/timelapse/timelapseVideo", async (importOriginal) => ({
  ...(await importOriginal<typeof TimelapseVideo>()),
  buildTimelapseVideo: vi.fn(() => new Promise(() => {})),
}));

/** 재생기는 따로 검증했다. */
vi.mock("@/features/timelapse/TimelapsePlayer", () => ({
  TimelapsePlayer: (props: { children?: ReactNode }) => (
    <div data-testid="player">{props.children}</div>
  ),
}));

/**
 * fake-indexeddb 위의 실제 저장소로 전체 목록을 그린다.
 * 테스트마다 새 IDBFactory를 깔아 앞 테스트의 DB가 남지 않게 한다.
 */

const HOUR = 3_600_000;
const NOON = new Date(2026, 9, 7, 12, 0).getTime();
const EMPTY_NOTICE = "공부를 완료하고 공부한 모습을 공유해보세요";

let store: TimelapseStore;

beforeEach(() => {
  // 보관 기한(7일)을 시각에 맞춰 판정하므로 시계를 고정한다. 타이머는 실제로 둔다.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOON);
  globalThis.indexedDB = new IDBFactory();
  store = createIndexedDbTimelapseStore();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

/** 사진 세 장으로 타임랩스 하나를 목록에 올린다. 공부는 한 시간이다. */
async function seed(startedAtMs: number, focusSec = 8_040, studySec = 9_600) {
  await store.begin(startedAtMs, DEFAULT_TIMELAPSE_SETTINGS);
  for (let index = 0; index < 3; index += 1) {
    await store.addPhoto(startedAtMs, new Uint8Array([index]).buffer, startedAtMs + index * 10_000);
  }
  await store.finalize(startedAtMs, { endedAtMs: startedAtMs + HOUR, studySec, focusSec });
}

function renderPage(pageStore: TimelapseStore = store) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/timelapses?userId=7"]}>
        <Routes>
          <Route path="/timelapses" element={<TimelapsesPage store={pageStore} />} />
          <Route path="/home" element={<p>홈 화면</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

async function openDeleteDialog(name: RegExp = /타임랩스 삭제/) {
  fireEvent.click(await screen.findByRole("button", { name }));
  const dialog = await screen.findByRole("alertdialog", { name: "타임랩스 삭제" });
  expect(dialog).toHaveAccessibleDescription("정말 삭제하시겠어요?");
  return dialog;
}

describe("타임랩스 전체 목록", () => {
  it("보관 중인 타임랩스를 최신부터 순공·총 공부·집중률·날짜 시각으로 보여준다", async () => {
    await seed(NOON - 26 * HOUR, 3_000, 6_000);
    await seed(NOON - HOUR);
    renderPage();

    const items = await screen.findAllByRole("listitem");

    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("순공 2시간 14분");
    expect(items[0]).toHaveTextContent("총 공부 2시간 40분 · 집중률 84%");
    expect(items[0]).toHaveTextContent("10월 7일 (수) 11:00 – 12:00");
    expect(items[1]).toHaveTextContent("순공 50분");
    expect(items[1]).toHaveTextContent("10월 6일 (화) 10:00 – 11:00");
    expect(screen.getByText("최근 7일 동안 최대 7개까지 기기 내에 보관돼요")).toBeInTheDocument();
  });

  it("확인 창에서 삭제를 누르면 지우고 목록과 공유 캐시에서도 뺀다", async () => {
    await seed(NOON - 26 * HOUR);
    await seed(NOON - HOUR);
    const { client } = renderPage();

    const dialog = await openDeleteDialog(/10월 7일 11:00 타임랩스 삭제/);
    fireEvent.click(within(dialog).getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await expect(store.listReady()).resolves.toHaveLength(1);
    // 홈 목록과 같은 캐시라 홈에서도 바로 사라진다.
    const cached = client.getQueryData<{ startedAtMs: number }[]>(["timelapse", "recent"]);
    expect(cached?.map((record) => record.startedAtMs)).toEqual([NOON - 26 * HOUR]);
  });

  it("확인 창에서 취소를 누르면 그대로 둔다", async () => {
    await seed(NOON - HOUR);
    renderPage();

    const dialog = await openDeleteDialog();
    // 실수로 지우지 않게 처음 포커스는 취소에 있다.
    expect(within(dialog).getByRole("button", { name: "취소" })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    await expect(store.listReady()).resolves.toHaveLength(1);
  });

  it("창이 닫히면 누른 휴지통으로 포커스가 돌아온다", async () => {
    await seed(NOON - HOUR);
    renderPage();

    const trash = await screen.findByRole("button", { name: /타임랩스 삭제/ });
    trash.focus();
    fireEvent.click(trash);
    const dialog = await screen.findByRole("alertdialog", { name: "타임랩스 삭제" });
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));

    await waitFor(() => expect(trash).toHaveFocus());
  });

  it("삭제하면 다음 줄의 휴지통으로 포커스를 옮긴다", async () => {
    await seed(NOON - 26 * HOUR);
    await seed(NOON - HOUR);
    renderPage();

    const trash = await screen.findByRole("button", { name: /10월 7일 11:00 타임랩스 삭제/ });
    trash.focus();
    fireEvent.click(trash);
    const dialog = await screen.findByRole("alertdialog", { name: "타임랩스 삭제" });
    fireEvent.click(within(dialog).getByRole("button", { name: "삭제" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /10월 6일 10:00 타임랩스 삭제/ })).toHaveFocus(),
    );
  });

  it("마지막 하나를 지우면 뒤로 가기로 포커스를 옮긴다", async () => {
    await seed(NOON - HOUR);
    renderPage();

    const trash = await screen.findByRole("button", { name: /타임랩스 삭제/ });
    trash.focus();
    fireEvent.click(trash);
    const dialog = await screen.findByRole("alertdialog", { name: "타임랩스 삭제" });
    fireEvent.click(within(dialog).getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "뒤로 가기" })).toHaveFocus());
  });

  it("Esc를 누르면 취소와 같다", async () => {
    await seed(NOON - HOUR);
    renderPage();

    const dialog = await openDeleteDialog();
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await expect(store.listReady()).resolves.toHaveLength(1);
  });

  it("마지막 하나를 지우면 홈과 같은 안내를 보여준다", async () => {
    await seed(NOON - HOUR);
    renderPage();

    const dialog = await openDeleteDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "삭제" }));

    expect(await screen.findByText(EMPTY_NOTICE)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("삭제에 실패하면 알림을 띄우고 줄을 남긴다", async () => {
    await seed(NOON - HOUR);
    const failing: TimelapseStore = {
      ...store,
      remove: () => Promise.reject(new Error("IndexedDB 쓰기 실패")),
    };
    renderPage(failing);

    const dialog = await openDeleteDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith("삭제하지 못했어요"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("썸네일은 세션 리플레이에서 가린다", async () => {
    await seed(NOON - HOUR);
    renderPage();

    const item = await screen.findByRole("listitem");
    await waitFor(() => expect(item.querySelectorAll("img")).toHaveLength(1));

    expect(item.querySelector("img")).toHaveClass("amp-block", "sentry-block");
  });

  it("딥링크로 열었으면 뒤로 가기가 홈으로 간다", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "뒤로 가기" }));

    expect(await screen.findByText("홈 화면")).toBeInTheDocument();
  });

  it("줄을 누르면 공유 창이 열리고 닫으면 그 줄로 포커스가 돌아온다", async () => {
    await seed(NOON - HOUR);
    renderPage();

    const row = await screen.findByRole("button", { name: /순공 2시간 14분/ });
    expect(row).toHaveAttribute("aria-haspopup", "dialog");
    row.focus();
    fireEvent.click(row);
    const dialog = await screen.findByRole("dialog", { name: "공유하기" });
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(row).toHaveFocus();
  });

  it("휴지통을 누르면 공유 창이 아니라 삭제 확인 창만 열린다", async () => {
    await seed(NOON - HOUR);
    renderPage();

    await openDeleteDialog();

    expect(screen.queryByRole("dialog", { name: "공유하기" })).toBeNull();
  });
});

describe("타임랩스 전체 목록 라우트", () => {
  afterEach(() => {
    appQueryClient.clear();
    vi.unstubAllEnvs();
  });

  function renderApp() {
    return render(
      <MemoryRouter initialEntries={["/timelapses?userId=7"]}>
        <App />
      </MemoryRouter>,
    );
  }

  it("플래그가 켜져 있으면 /timelapses가 열린다", async () => {
    vi.stubEnv("VITE_TIMELAPSE", "on");
    renderApp();

    expect(await screen.findByRole("heading", { name: "최근 타임랩스" })).toBeInTheDocument();
  });

  it("플래그가 꺼져 있으면 /timelapses가 없다", async () => {
    vi.stubEnv("VITE_TIMELAPSE", "");
    // 청크를 미리 받아 두어야 라우트가 있을 때 아래 대기 안에 페이지가 그려진다.
    await import("@/routes/TimelapsesPage");
    renderApp();

    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByRole("heading", { name: "최근 타임랩스" })).toBeNull();
  });
});
