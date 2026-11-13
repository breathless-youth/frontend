import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { writeTimerBackground } from "@/features/timer-background/timerBackground";

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

  it("처음에는 마스코트가 없고 메뉴에서 보이기를 고르면 나타나며 켜짐을 저장한다", async () => {
    renderRoom();
    expect(mascotSheet()).toBeNull();

    await openMoreMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "마스코트 보이기" }));

    expect(mascotSheet()).not.toBeNull();
    expect(localStorage.getItem("focuson.sessionMascot.v1")).toBe("on");
    expect(amplitude.trackSessionMascotToggled).toHaveBeenCalledWith(true);
  });

  it("켜 둔 기기에서는 화면 크기와 상관없이 하단 바 줄에 마스코트를 띄운다", () => {
    localStorage.setItem("focuson.sessionMascot.v1", "on");
    renderRoom();

    const sheet = mascotSheet() as HTMLElement;
    expect(sheet).not.toBeNull();
    const toolbar = screen.getByRole("toolbar", { name: "공부 조작" });
    expect(toolbar).not.toContainElement(sheet);
  });

  it("마스코트는 하단 바와 같은 줄의 왼쪽 끝에 놓이고 바는 가운데에 남는다", () => {
    localStorage.setItem("focuson.sessionMascot.v1", "on");
    renderRoom();

    const inner = screen.getByRole("toolbar", { name: "공부 조작" }).parentElement!;
    const row = inner.parentElement!;
    expect(row.className).toContain("relative");
    expect(row.className).toContain("w-full");
    expect(row.className).toContain("justify-center");
    const mascot = mascotSheet()!.parentElement!;
    expect(inner).toContainElement(mascot);
    expect(mascot.className).toContain("left-0");
    // 월페이퍼가 없으면 가로 폰에서도 왼쪽 끝 그대로다.
    expect(inner.className).not.toContain("landscape-compact:relative");
    expect(mascot.className).not.toContain("landscape-compact:right-full");
  });

  it("월페이퍼가 있으면 가로 폰에서만 하단 바 왼쪽 옆으로 붙는다", () => {
    localStorage.setItem("focuson.sessionMascot.v1", "on");
    writeTimerBackground({ kind: "proctor" });
    renderRoom();

    const inner = screen.getByRole("toolbar", { name: "공부 조작" }).parentElement!;
    expect(inner.className).toContain("landscape-compact:relative");
    const mascot = mascotSheet()!.parentElement!;
    expect(mascot.className).toContain("left-0");
    expect(mascot.className).toContain("landscape-compact:left-auto");
    expect(mascot.className).toContain("landscape-compact:right-full");
    expect(mascot.className).toContain("landscape-compact:mr-3");
  });

  it("더보기 메뉴에서 숨기면 마스코트가 사라지고 꺼짐을 저장한다", async () => {
    localStorage.setItem("focuson.sessionMascot.v1", "on");
    renderRoom();

    await openMoreMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "마스코트 숨기기" }));

    expect(mascotSheet()).toBeNull();
    expect(localStorage.getItem("focuson.sessionMascot.v1")).toBe("off");
    expect(amplitude.trackSessionMascotToggled).toHaveBeenCalledWith(false);
  });
});
