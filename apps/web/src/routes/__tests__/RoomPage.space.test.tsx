import type { ProfileResponse } from "@focusmakers/types";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { timerBackgroundPhotoStore } from "@/features/timer-background/timerBackgroundPhotos";
import {
  trackSessionSpaceOpened,
  trackStudySessionEnded,
  trackTimerBackgroundApplied,
} from "@/lib/amplitude";
import { getDecorations, getShopItems, putTimerBackground } from "@/lib/pointsApi";
import { profileKeys } from "@/lib/profileQueries";
import { queryClient } from "@/lib/queryClient";
import { showCtaToast } from "@/lib/toast";
import { PROCTOR_SPACE, RAIN_ITEM, RAIN_SPACE, shopSpace } from "@/test/spaceFixtures";

import { answerCameraPrompt } from "@/test/cameraPrompt";
import { RoomPage } from "../RoomPage";

/**
 * 공간 버튼·페이지·배경의 RoomPage 연결만 본다.
 * 페이지 안 조작은 `SessionSpacePage.test.tsx`, 감시 소리 재생기는 `watcherSound.test.ts`가 검증한다.
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
  trackTimerBackgroundApplied: vi.fn(),
}));

vi.mock("@/lib/pointsApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getShopItems: vi.fn(),
  getDecorations: vi.fn(),
  putTimerBackground: vi.fn(),
}));

vi.mock("@/lib/toast", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  showCtaToast: vi.fn(),
}));

const KEY = "focusmakers.timerBackground";
const PROCTOR_DECORATION = {
  itemId: 41,
  code: "SPACE_PROCTOR",
  imageUrl: null,
  assetKey: "watcher/9c8d9f19",
  assetType: "VIDEO",
  videoMode: "WATCH",
};

function signIn() {
  queryClient.setQueryData(profileKeys.detail(1), { loginProvider: "KAKAO" } as ProfileResponse);
}

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
    vi.mocked(getShopItems).mockResolvedValue({ items: [shopSpace(), RAIN_ITEM] });
    vi.mocked(getDecorations).mockResolvedValue({
      selectedMascotCode: "BOOK",
      accessories: [],
      timerBackground: null,
    });
    vi.mocked(putTimerBackground).mockResolvedValue({
      selectedMascotCode: "BOOK",
      accessories: [],
      timerBackground: null,
    });
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

  it("공간 음량을 바꾸면 감시 소리에 반영하고 손을 뗄 때 저장한다", async () => {
    localStorage.setItem(KEY, JSON.stringify(PROCTOR_SPACE));
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "공간" }));

    const slider = await screen.findByRole("slider", { name: "공간 음량" });
    fireEvent.change(slider, { target: { value: "30" } });
    fireEvent.pointerUp(slider);

    expect(sound.setVolume).toHaveBeenLastCalledWith(0.3);
    expect(localStorage.getItem("focusmakers.watcherSound.volume")).toBe("30");
  });

  // 감독관이 다가오고 들어오는 동안 화면을 바꿔도 발소리를 건너뛰지 않아야 돌아왔을 때 소리 없이 서 있지 않는다.
  it("심플 모드와 작은 창을 키운 동안에도 감시 소리를 끄지 않는다", async () => {
    localStorage.setItem(KEY, JSON.stringify(PROCTOR_SPACE));
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "내 화면 크게 보기" }));
    await userEvent.click(screen.getByRole("button", { name: "작게 보기" }));
    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));

    expect(sound.prime).toHaveBeenCalled();
    expect(sound.setMuted).not.toHaveBeenCalledWith(true);
    expect(sound.stopAll).not.toHaveBeenCalled();
  });

  // 제출 실패나 종료 안내에 머물면 화면이 닫히지 않아, 공부가 끝나는 순간 무음 루프와 누름 구독을 따로 풀어야 한다.
  it("공부를 끝내면 감시 소리를 멈추고 화면을 눌러도 다시 깨우지 않는다", async () => {
    localStorage.setItem(KEY, JSON.stringify(PROCTOR_SPACE));
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

  it("서버 감시 공간을 적용하면 일반 모드에 배경이 깔리고 심플 모드에서는 걷힌다", async () => {
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "공간" }));

    await userEvent.click(await screen.findByRole("button", { name: "독서실 감독관" }));

    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(PROCTOR_SPACE);
    expect(screen.getByTestId("timer-background")).toHaveAttribute("data-visible", "true");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));
    expect(screen.getByTestId("timer-background")).toHaveAttribute("data-visible", "false");
  });

  it("비회원은 서버에 묻지도 저장하지도 않고 기기 값만 바꾼다", async () => {
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "공간" }));

    await userEvent.click(await screen.findByRole("button", { name: "독서실 감독관" }));

    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(PROCTOR_SPACE);
    expect(putTimerBackground).not.toHaveBeenCalled();
    expect(getDecorations).not.toHaveBeenCalled();
  });

  it("회원이 서버 공간을 고르면 서버에 저장하고 심플을 고르면 null을 저장한다", async () => {
    signIn();
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "공간" }));

    await userEvent.click(await screen.findByRole("button", { name: "독서실 감독관" }));
    await waitFor(() => expect(putTimerBackground).toHaveBeenCalledWith(41));

    await userEvent.click(screen.getByRole("tab", { name: "이미지" }));
    await userEvent.click(await screen.findByRole("button", { name: "심플" }));
    await waitFor(() => expect(putTimerBackground).toHaveBeenLastCalledWith(null));
  });

  it("회원의 서버 저장이 실패하면 이전 공간으로 되돌리고 실패를 알린다", async () => {
    signIn();
    vi.mocked(putTimerBackground).mockRejectedValue(new Error("offline"));
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "공간" }));

    await userEvent.click(await screen.findByRole("button", { name: "독서실 감독관" }));

    await waitFor(() =>
      expect(showCtaToast).toHaveBeenCalledWith("공간을 바꾸지 못했어요. 다시 시도해 주세요"),
    );
    expect(localStorage.getItem(KEY)).toBe('{"kind":"simple"}');
    expect(screen.queryByTestId("watcher-background")).not.toBeInTheDocument();
    expect(trackTimerBackgroundApplied).not.toHaveBeenCalled();
  });

  it("회원이면 기기 값으로 먼저 그리고 서버 값이 오면 맞춘 뒤 기기 값도 고친다", async () => {
    signIn();
    localStorage.setItem(KEY, JSON.stringify(RAIN_SPACE));
    let answer!: (value: Awaited<ReturnType<typeof getDecorations>>) => void;
    vi.mocked(getDecorations).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderRoom();

    expect(screen.getByTestId("timer-background").querySelector("video")?.src).toContain(
      "/spaces/loop/1a2b3c4d/loop/",
    );

    answer({ selectedMascotCode: "BOOK", accessories: [], timerBackground: PROCTOR_DECORATION });

    expect(await screen.findByTestId("watcher-background")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(PROCTOR_SPACE);
    expect(trackTimerBackgroundApplied).not.toHaveBeenCalled();
  });

  it("반복 영상과 포스터를 받지 못하면 심플로 그리고 기기 값은 그대로 둔다", () => {
    localStorage.setItem(KEY, JSON.stringify(RAIN_SPACE));
    renderRoom();

    fireEvent.error(screen.getByTestId("timer-background").querySelector("video")!);
    fireEvent.error(screen.getByTestId("timer-background").querySelector("img")!);

    expect(screen.queryByTestId("timer-background")).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(RAIN_SPACE);
  });

  it("옛 독서실 감독관 값은 심플로 바꾸고 그리지 않으며 소리도 깨우지 않는다", () => {
    localStorage.setItem(KEY, '{"kind":"proctor"}');
    renderRoom();

    expect(screen.queryByTestId("watcher-background")).not.toBeInTheDocument();
    expect(screen.queryByTestId("timer-background")).not.toBeInTheDocument();
    expect(sound.prime).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).toBe('{"kind":"simple"}');
  });

  it("회원이어도 고른 사진을 읽지 못하면 서버 값으로 덮지 않고 사진 선택을 둔다", async () => {
    signIn();
    const photo = '{"kind":"photo","photoId":"p1"}';
    localStorage.setItem(KEY, photo);
    vi.mocked(getDecorations).mockResolvedValue({
      selectedMascotCode: "BOOK",
      accessories: [],
      timerBackground: PROCTOR_DECORATION,
    });
    const get = vi
      .spyOn(timerBackgroundPhotoStore(), "get")
      .mockRejectedValue(new DOMException("blocked", "UnknownError"));
    renderRoom();

    // 한 번 다시 읽고서야 실패로 끝난다.
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await waitFor(() => expect(getDecorations).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(localStorage.getItem(KEY)).toBe(photo);
    expect(screen.queryByTestId("watcher-background")).not.toBeInTheDocument();
  });

  it("회원이 공간을 연달아 고르면 앞 저장이 끝난 뒤에 뒤 공간을 저장해 서버에 마지막 공간이 남는다", async () => {
    signIn();
    let finishFirst!: () => void;
    const saved = {
      selectedMascotCode: "BOOK",
      accessories: [],
      timerBackground: null,
    };
    vi.mocked(putTimerBackground)
      .mockReturnValueOnce(new Promise((resolve) => (finishFirst = () => resolve(saved))))
      .mockResolvedValue(saved);
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "공간" }));

    await userEvent.click(await screen.findByRole("button", { name: "독서실 감독관" }));
    await waitFor(() => expect(putTimerBackground).toHaveBeenCalledWith(41));
    await userEvent.click(screen.getByRole("button", { name: "비 오는 창가" }));
    await act(async () => {});
    expect(vi.mocked(putTimerBackground).mock.calls).toEqual([[41]]);

    await act(async () => finishFirst());
    await waitFor(() => expect(putTimerBackground).toHaveBeenLastCalledWith(42));
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(RAIN_SPACE);
  });
});
