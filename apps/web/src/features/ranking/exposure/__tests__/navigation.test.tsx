import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMemoryBoardMemoryStore,
  resetBoardMemoryStore,
  setBoardMemoryStore,
  takeRecordsPageRequest,
} from "@/features/ranking/model/boardMemory";

import { useOpenRanking } from "../navigation";

beforeEach(() => {
  setBoardMemoryStore(createMemoryBoardMemoryStore());
});

afterEach(() => {
  resetBoardMemoryStore();
  vi.unstubAllGlobals();
});

function Opener() {
  const { openRecords } = useOpenRanking();
  return (
    <button type="button" onClick={() => openRecords("top3_modal")}>
      기록 열기
    </button>
  );
}

function Probe() {
  const { pathname, search } = useLocation();
  return <p>{`${pathname}${search}`}</p>;
}

function renderOpener() {
  render(
    <MemoryRouter initialEntries={["/home?userId=7"]}>
      <Routes>
        <Route path="/home" element={<Opener />} />
        <Route path="/ranking" element={<Probe />} />
        <Route path="/ranking/records" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function sent(postMessage: ReturnType<typeof vi.fn>) {
  return postMessage.mock.calls.map(
    ([raw]) => JSON.parse(raw as string) as Record<string, unknown>,
  );
}

describe("useOpenRanking", () => {
  it("브라우저에서는 모두 보기로 바로 가고 요청을 남기지 않는다", async () => {
    renderOpener();

    await userEvent.click(screen.getByRole("button", { name: "기록 열기" }));

    expect(await screen.findByText("/ranking/records?userId=7")).toBeInTheDocument();
    expect(takeRecordsPageRequest()).toBe(false);
  });

  it("앱에서는 모두 보기 요청을 남기고 셸에 랭킹 탭 전환을 맡긴다", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    renderOpener();

    await userEvent.click(screen.getByRole("button", { name: "기록 열기" }));

    expect(sent(postMessage)).toEqual([
      expect.objectContaining({ type: "navigate-tab", tab: "ranking", via: "top3_modal" }),
    ]);
    expect(takeRecordsPageRequest()).toBe(true);
  });
});
