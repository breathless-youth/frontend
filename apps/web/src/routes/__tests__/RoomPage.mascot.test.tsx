import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoomPage } from "../RoomPage";

/**
 * 공부 화면 마스코트의 RoomPage 연결만 본다.
 * 표정과 움직임 규칙은 `SessionMascot.test.tsx`와 `mascotExpression.test.ts`가 본다.
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

const amplitude = vi.hoisted(() => ({ trackSessionMascotToggled: vi.fn() }));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...amplitude,
}));

function renderRoom() {
  return render(
    <MemoryRouter initialEntries={["/room/7?userId=1"]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** 폭 600 이상이면서 가로 폰은 아닌 태블릿 창으로 만든다. */
function stubTabletWindow() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(min-width: 37.5rem)",
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

const mascotSheet = () => document.querySelector('img[src*="mascot-stopwatch-sprite"]');

async function openMoreMenu() {
  await userEvent.click(screen.getByRole("button", { name: "더보기" }));
}

describe("RoomPage 마스코트", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("폰과 같은 판정이면 마스코트도 메뉴 항목도 없다", async () => {
    renderRoom();

    expect(mascotSheet()).toBeNull();
    await openMoreMenu();
    expect(screen.queryByRole("menuitem", { name: "마스코트 숨기기" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "마스코트 보이기" })).toBeNull();
  });

  it("태블릿 창이면 하단 바 옆에 마스코트를 띄운다", () => {
    stubTabletWindow();
    renderRoom();

    const sheet = mascotSheet();
    expect(sheet).not.toBeNull();
    const toolbar = screen.getByRole("toolbar", { name: "공부 조작" });
    expect(toolbar).not.toContainElement(sheet as HTMLElement);
    expect(toolbar.parentElement).toContainElement(sheet as HTMLElement);
  });

  it("마스코트는 하단 바와 같은 줄의 왼쪽 끝에 놓이고 바는 가운데에 남는다", () => {
    stubTabletWindow();
    renderRoom();

    const row = screen.getByRole("toolbar", { name: "공부 조작" }).parentElement!;
    expect(row.className).toContain("w-full");
    expect(row.className).toContain("justify-center");
    const mascot = mascotSheet()!.parentElement!;
    expect(mascot.parentElement).toBe(row);
    expect(mascot.className).toContain("left-0");
    expect(mascot.className).not.toContain("right-full");
  });

  it("더보기 메뉴에서 숨기면 마스코트가 사라지고 꺼짐을 저장한다", async () => {
    stubTabletWindow();
    renderRoom();

    await openMoreMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "마스코트 숨기기" }));

    expect(mascotSheet()).toBeNull();
    expect(localStorage.getItem("focuson.sessionMascot.v1")).toBe("off");
    expect(amplitude.trackSessionMascotToggled).toHaveBeenCalledWith(false);
  });

  it("꺼 둔 기기에서는 태블릿이어도 마스코트가 없고 메뉴는 보이기 문구다", async () => {
    localStorage.setItem("focuson.sessionMascot.v1", "off");
    stubTabletWindow();
    renderRoom();

    expect(mascotSheet()).toBeNull();
    await openMoreMenu();
    expect(screen.getByRole("menuitem", { name: "마스코트 보이기" })).toBeInTheDocument();
  });
});
