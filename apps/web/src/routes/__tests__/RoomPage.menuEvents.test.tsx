import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  trackSessionMoreMenuItemSelected,
  trackSessionMoreMenuOpened,
  trackSessionSideButtonPressed,
  trackSessionSimpleModeToggled,
} from "@/lib/amplitude";
import { answerCameraPrompt } from "@/test/cameraPrompt";
import { RoomPage } from "../RoomPage";

/**
 * 싱글룸 더보기 메뉴, 세로 열 버튼, 화면 탭 전환의 계측 연결만 본다.
 * 이벤트 모양은 `lib/__tests__/amplitude.test.ts`가 고정한다.
 */
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => ({ settled: true, restored: null }),
}));

vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(),
}));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  trackSessionMoreMenuOpened: vi.fn(),
  trackSessionMoreMenuItemSelected: vi.fn(),
  trackSessionSideButtonPressed: vi.fn(),
  trackSessionSimpleModeToggled: vi.fn(),
}));

function renderRoom() {
  render(
    <MemoryRouter initialEntries={["/room/7?userId=1"]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
  answerCameraPrompt("camera");
}

describe("RoomPage 메뉴·세로 열·화면 탭 이벤트", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ version: 1, sounds: [] }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it.each([
    ["카메라 전환", "flip_camera"],
    ["플래너", "planner"],
    ["도움말 보기", "help"],
  ] as const)("더보기를 열고 %s 항목을 고르면 메뉴 이벤트를 보낸다", async (name, item) => {
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    await userEvent.click(screen.getByRole("menuitem", { name }));

    expect(trackSessionMoreMenuOpened).toHaveBeenCalledOnce();
    expect(trackSessionMoreMenuItemSelected).toHaveBeenCalledExactlyOnceWith({ item });
  });

  it.each([
    ["공간", "space"],
    [/^배경음/, "ambient"],
    ["타이머", "timer"],
  ] as const)("세로 열 %s 버튼을 누르면 어떤 버튼인지 보낸다", async (name, button) => {
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name }));

    expect(trackSessionSideButtonPressed).toHaveBeenCalledExactlyOnceWith({ button });
  });

  it("심플 모드로 들어갈 때만 어느 화면에서 왔는지 싣는다", async () => {
    renderRoom();
    const toggle = screen.getByRole("button", { name: "심플 모드 전환" });

    await userEvent.click(toggle);
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole("button", { name: "내 화면 크게 보기" }));
    await userEvent.click(toggle);

    expect(vi.mocked(trackSessionSimpleModeToggled).mock.calls).toEqual([
      [true, "pip"],
      [false],
      [true, "expanded"],
    ]);
  });
});
