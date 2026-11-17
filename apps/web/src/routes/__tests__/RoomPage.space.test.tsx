import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { timerBackgroundPhotoStore } from "@/features/timer-background/timerBackgroundPhotos";
import { trackSessionSpaceOpened, trackStudySessionEnded } from "@/lib/amplitude";
import { queryClient } from "@/lib/queryClient";

import { answerCameraPrompt } from "@/test/cameraPrompt";
import { RoomPage } from "../RoomPage";

/**
 * 공간 버튼·페이지·배경의 RoomPage 연결만 본다.
 * 페이지 안 조작은 `SessionSpacePage.test.tsx`, 감독관 소리 재생기는 `watcherSound.test.ts`가 검증한다.
 */
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => ({ settled: true, restored: null }),
}));

vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(),
}));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  trackSessionSpaceOpened: vi.fn(),
  trackStudySessionEnded: vi.fn(),
}));

const sound = vi.hoisted(() => ({
  prime: vi.fn(),
  play: vi.fn(),
  fadeApproach: vi.fn(),
  setMuted: vi.fn(),
  setVolume: vi.fn(),
  stopAll: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("@/features/timer-background/watcher/watcherSound", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createWatcherSound: () => sound,
}));

function renderRoom() {
  const view = render(
    <MemoryRouter initialEntries={["/room/7?userId=1"]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
  // 카메라 켜기로 답해 일반 모드에서 시작한다.
  answerCameraPrompt("camera");
  return view;
}

describe("RoomPage 공간", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    // 배경음 목록을 받는다. jsdom은 상대 URL fetch가 던지므로 응답을 준다.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ version: 1, sounds: [] }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("세로 열 맨 위에 공간 버튼이 있고 누르면 공간 페이지가 열리며 이벤트를 보낸다", async () => {
    renderRoom();

    const names = within(screen.getByRole("group", { name: "부가 기능" }))
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(names[0]).toBe("공간");
    await userEvent.click(screen.getByRole("button", { name: "공간" }));

    expect(await screen.findByRole("dialog", { name: "공간" })).toBeInTheDocument();
    expect(trackSessionSpaceOpened).toHaveBeenCalledOnce();
  });

  it("공간을 고른 적이 없으면 배경 그림이 없다", () => {
    renderRoom();

    expect(screen.queryByTestId("timer-background")).not.toBeInTheDocument();
  });

  it("감독관을 적용하면 일반 모드에 배경이 깔리고 심플 모드에서는 걷힌다", async () => {
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "공간" }));

    await userEvent.click(await screen.findByRole("button", { name: "독서실 감독관" }));

    expect(localStorage.getItem("focusmakers.timerBackground")).toBe('{"kind":"proctor"}');
    expect(screen.getByTestId("timer-background")).toHaveAttribute("data-visible", "true");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));
    expect(screen.getByTestId("timer-background")).toHaveAttribute("data-visible", "false");
  });

  it("공간 음량을 바꾸면 감독관 소리에 반영하고 손을 뗄 때 저장한다", async () => {
    localStorage.setItem("focusmakers.timerBackground", '{"kind":"proctor"}');
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "공간" }));

    const slider = await screen.findByRole("slider", { name: "공간 음량" });
    fireEvent.change(slider, { target: { value: "30" } });
    fireEvent.pointerUp(slider);

    expect(sound.setVolume).toHaveBeenLastCalledWith(0.3);
    expect(localStorage.getItem("focusmakers.watcherSound.volume")).toBe("30");
  });

  // 감독관이 다가오고 들어오는 동안 화면을 바꿔도 발소리를 건너뛰지 않아야 돌아왔을 때 소리 없이 서 있지 않는다.
  it("심플 모드와 작은 창을 키운 동안에도 감독관 발소리를 끄지 않는다", async () => {
    localStorage.setItem("focusmakers.timerBackground", '{"kind":"proctor"}');
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "내 화면 크게 보기" }));
    await userEvent.click(screen.getByRole("button", { name: "작게 보기" }));
    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));

    expect(sound.prime).toHaveBeenCalled();
    expect(sound.setMuted).not.toHaveBeenCalledWith(true);
    expect(sound.stopAll).not.toHaveBeenCalled();
  });

  // 제출 실패나 종료 안내에 머물면 화면이 닫히지 않아, 공부가 끝나는 순간 무음 루프와 누름 구독을 따로 풀어야 한다.
  it("공부를 끝내면 감독관 소리를 멈추고 화면을 눌러도 다시 깨우지 않는다", async () => {
    localStorage.setItem("focusmakers.timerBackground", '{"kind":"proctor"}');
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));
    await userEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "공부 종료" }),
    );

    await waitFor(() => expect(sound.stopAll).toHaveBeenCalled());
    const primes = sound.prime.mock.calls.length;
    fireEvent.pointerDown(window);
    expect(sound.prime).toHaveBeenCalledTimes(primes);
  });
  it("고른 사진을 읽지 못하면 심플로 그리고 종료 이벤트에도 심플로 싣는다", async () => {
    localStorage.setItem("focusmakers.timerBackground", '{"kind":"photo","photoId":"p1"}');
    const get = vi
      .spyOn(timerBackgroundPhotoStore(), "get")
      .mockRejectedValue(new DOMException("blocked", "UnknownError"));
    renderRoom();
    // 한 번 다시 읽고서야 실패로 끝난다.
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2), { timeout: 3000 });

    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));
    await userEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "공부 종료" }),
    );

    await waitFor(() => expect(trackStudySessionEnded).toHaveBeenCalledOnce());
    expect(vi.mocked(trackStudySessionEnded).mock.calls[0]?.[0].display?.spaceKind).toBe("simple");
    expect(screen.queryByTestId("timer-background-layer")).not.toBeInTheDocument();
  });
});
