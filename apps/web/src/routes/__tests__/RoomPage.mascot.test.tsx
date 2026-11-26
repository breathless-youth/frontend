import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoomPage } from "../RoomPage";

/**
 * 공부 화면에는 마스코트가 없다. 휴식 화면 마스코트는 `SessionRestOverlay`가 따로 그린다.
 */
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => ({ settled: true, restored: null }),
}));

vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(),
}));

vi.mock("@/lib/subjectApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listSubjects: vi.fn(async (): Promise<unknown[]> => []),
}));

vi.mock("@/routes/lazyRoutes", () => ({ prefetchResultPage: vi.fn() }));

function renderRoom() {
  return render(
    <MemoryRouter initialEntries={["/room/7?userId=1"]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const mascotSheet = () => document.querySelector('img[src*="mascot-stopwatch-sprite"]');

async function openMoreMenu() {
  await userEvent.click(screen.getByRole("button", { name: "더보기" }));
}

describe("RoomPage 마스코트", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("예전에 캐릭터를 켜 둔 기기여도 공부 화면에 마스코트가 없고 더보기에도 캐릭터 항목이 없다", async () => {
    localStorage.setItem("focuson.sessionMascot.v1", "on");
    renderRoom();
    expect(mascotSheet()).toBeNull();

    await openMoreMenu();

    expect(screen.queryByRole("menuitem", { name: /캐릭터/ })).toBeNull();
  });
});
