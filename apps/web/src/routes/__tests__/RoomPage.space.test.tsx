import "fake-indexeddb/auto";

import type { ProfileResponse } from "@focusmakers/types";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { submitStudySession } from "@/features/study-session/submitStudySession";
import {
  __resetTimerBackgroundPhotoStoreForTests,
  timerBackgroundPhotoStore,
} from "@/features/timer-background/timerBackgroundPhotos";
import { createLoopSound } from "@/features/timer-background/loopSound";
import { createWatcherSound } from "@/features/timer-background/watcher/watcherSound";
import {
  trackSessionSpaceOpened,
  trackSpaceDistractSceneEntered,
  trackSpaceDistractSceneLeft,
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
 * 페이지 안 조작은 `SessionSpacePage.test.tsx`, 감독 소리 재생기는 `watcherSound.test.ts`가 검증한다.
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
  trackSpaceDistractSceneEntered: vi.fn(),
  trackSpaceDistractSceneLeft: vi.fn(),
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

const { sound, makeSound } = vi.hoisted(() => {
  const makeSound = () => ({
    prime: vi.fn(),
    play: vi.fn(),
    fadeApproach: vi.fn(),
    setMuted: vi.fn(),
    setVolume: vi.fn(),
    stopAll: vi.fn(),
    dispose: vi.fn(),
  });
  return { sound: makeSound(), makeSound };
});

vi.mock("@/features/timer-background/watcher/watcherSound", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createWatcherSound: vi.fn(() => sound),
}));

vi.mock("@/features/timer-background/loopSound", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createLoopSound: vi.fn(() => ({
    prime: vi.fn(),
    setActive: vi.fn(),
    setVolume: vi.fn(),
    fade: vi.fn(),
    dispose: vi.fn(),
  })),
}));

function loopSoundFor(part: string) {
  const index = vi.mocked(createLoopSound).mock.calls.findIndex(([url]) => url.includes(part));
  return vi.mocked(createLoopSound).mock.results[index]!.value as ReturnType<
    typeof createLoopSound
  >;
}

function FocusFeaturesResult() {
  const { state } = useLocation();
  return <p>{`집중 기능 사용: ${String(state?.focusFeaturesUsed)}`}</p>;
}

function renderRoom(entryMode: "camera" | "simple" = "camera") {
  const view = render(
    <MemoryRouter initialEntries={["/room/7?userId=1"]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
        <Route path="/room/:id/result" element={<FocusFeaturesResult />} />
      </Routes>
    </MemoryRouter>,
  );
  answerCameraPrompt(entryMode);
  return view;
}

describe("RoomPage 공간", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createWatcherSound).mockImplementation(() => sound as never);
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

  it.each([
    {
      name: "과목 없이 비 오는 창가를 쓰고 심플 배경으로 바꾼 뒤",
      background: RAIN_SPACE,
      nextSpace: "심플",
      eligible: true,
    },
    { name: "과목 없이 감독관 배경을 쓴 뒤", background: PROCTOR_SPACE, eligible: true },
    { name: "내 사진을 타이머 배경으로 쓴 뒤", usePhoto: true, eligible: true },
    { name: "기본 배경으로만 공부한 뒤", eligible: false },
    {
      name: "선택한 영상과 포스터를 모두 불러오지 못한 뒤",
      background: RAIN_SPACE,
      backgroundFailed: true,
      eligible: false,
    },
    {
      name: "저장된 배경이 심플 모드에 가려진 채 공부한 뒤",
      background: RAIN_SPACE,
      entryMode: "simple" as const,
      eligible: false,
    },
    {
      name: "일시정지 중에만 타이머 배경을 켠 뒤",
      nextSpace: "비 오는 창가",
      pauseBeforeApplying: true,
      eligible: false,
    },
    {
      name: "공간 페이지를 닫기 전에 고른 배경을 심플로 되돌린 뒤",
      nextSpace: "비 오는 창가",
      revertBeforeClosing: true,
      eligible: false,
    },
  ])(
    "$name 끝내면 집중 기능 사용 여부는 $eligible이다",
    async ({
      background,
      usePhoto,
      entryMode,
      nextSpace,
      pauseBeforeApplying,
      backgroundFailed,
      revertBeforeClosing,
      eligible,
    }) => {
      if (usePhoto) {
        globalThis.indexedDB = new IDBFactory();
        __resetTimerBackgroundPhotoStoreForTests();
        const photo = await timerBackgroundPhotoStore().add(
          { bytes: new ArrayBuffer(1), width: 1, height: 1 },
          1,
        );
        localStorage.setItem(KEY, JSON.stringify({ kind: "photo", photoId: photo.id }));
      } else if (background) {
        localStorage.setItem(KEY, JSON.stringify(background));
      }
      vi.mocked(submitStudySession).mockResolvedValueOnce([
        {
          id: 1,
          userId: 1,
          statDate: "2026-11-22",
          startedAt: "2026-11-22T01:00:00Z",
          endedAt: "2026-11-22T01:30:00Z",
          studySec: 1800,
          focusSec: 1800,
          focusRate: 100,
          events: [],
        },
      ]);

      renderRoom(entryMode);
      if (usePhoto) {
        expect(await screen.findByTestId("timer-background-layer")).toBeInTheDocument();
      }
      const wallpaper = screen.queryByTestId("timer-background");
      if (wallpaper && !backgroundFailed) {
        const image = wallpaper.querySelector("img");
        if (image) fireEvent.load(image);
        else fireEvent.loadedData(wallpaper.querySelector("video")!);
      }

      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(Date.now() + 1_800_000);
        if (backgroundFailed) {
          fireEvent.error(wallpaper!.querySelector("video")!);
          fireEvent.error(wallpaper!.querySelector("img")!);
        }
        if (nextSpace !== undefined) {
          if (pauseBeforeApplying) {
            await userEvent.click(screen.getByRole("button", { name: "일시정지" }));
          }
          await userEvent.click(screen.getByRole("button", { name: "공간" }));
          if (nextSpace === "심플") {
            await userEvent.click(screen.getByRole("tab", { name: "이미지" }));
          }
          await userEvent.click(await screen.findByRole("button", { name: nextSpace }));
          if (pauseBeforeApplying || revertBeforeClosing) {
            fireEvent.loadedData(screen.getByTestId("timer-background").querySelector("video")!);
          }
          if (revertBeforeClosing) {
            await userEvent.click(screen.getByRole("tab", { name: "이미지" }));
            await userEvent.click(await screen.findByRole("button", { name: "심플" }));
          }
          await userEvent.keyboard("{Escape}");
          vi.setSystemTime(Date.now() + 5_000);
        }
        await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));
        await userEvent.click(
          within(screen.getByRole("alertdialog")).getByRole("button", { name: "공부 종료" }),
        );

        expect(await screen.findByText(`집중 기능 사용: ${eligible}`)).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("공간 음량을 바꾸면 감독 소리에 반영하고 손을 뗄 때 저장한다", async () => {
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
  it("심플 모드와 작은 창을 키운 동안에도 감독 소리를 끄지 않는다", async () => {
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
  it("공부를 끝내면 감독 소리를 멈추고 화면을 눌러도 다시 깨우지 않는다", async () => {
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

  it("서버 감독 공간을 적용하면 일반 모드에 배경이 깔리고 심플 모드에서는 걷힌다", async () => {
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

  it("회원이 앞 저장을 기다리는 동안 두 번 더 고르면 가운데 공간은 서버에 보내지 않는다", async () => {
    signIn();
    const plain = shopSpace({
      id: 43,
      code: "SPACE_PLAIN",
      name: "그냥 영상",
      assetKey: "loop/plain",
      videoMode: "LOOP",
    });
    vi.mocked(getShopItems).mockResolvedValue({ items: [shopSpace(), RAIN_ITEM, plain] });
    let finishFirst!: () => void;
    const saved = { selectedMascotCode: "BOOK", accessories: [], timerBackground: null };
    vi.mocked(putTimerBackground)
      .mockReturnValueOnce(new Promise((resolve) => (finishFirst = () => resolve(saved))))
      .mockResolvedValue(saved);
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "공간" }));

    await userEvent.click(await screen.findByRole("button", { name: "독서실 감독관" }));
    await waitFor(() => expect(putTimerBackground).toHaveBeenCalledWith(41));
    await userEvent.click(screen.getByRole("button", { name: "비 오는 창가" }));
    await userEvent.click(screen.getByRole("button", { name: "그냥 영상" }));
    await act(async () => finishFirst());

    await waitFor(() => expect(putTimerBackground).toHaveBeenLastCalledWith(43));
    expect(vi.mocked(putTimerBackground).mock.calls).toEqual([[41], [43]]);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ kind: "space", itemId: 43 });
  });

  it("회원이 고른 사진의 저장이 실패해도 그 사이 사진을 지워 심플로 돌렸으면 앞 공간으로 되돌리지 않는다", async () => {
    signIn();
    globalThis.indexedDB = new IDBFactory();
    __resetTimerBackgroundPhotoStoreForTests();
    await timerBackgroundPhotoStore().add({ bytes: new ArrayBuffer(1), width: 1, height: 1 }, 1);
    let finishFirst!: () => void;
    const saved = { selectedMascotCode: "BOOK", accessories: [], timerBackground: null };
    vi.mocked(putTimerBackground)
      .mockReturnValueOnce(new Promise((resolve) => (finishFirst = () => resolve(saved))))
      .mockRejectedValueOnce(new Error("offline"));
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "공간" }));

    await userEvent.click(await screen.findByRole("button", { name: "독서실 감독관" }));
    await waitFor(() => expect(putTimerBackground).toHaveBeenCalledWith(41));
    await userEvent.click(screen.getByRole("tab", { name: "이미지" }));
    await userEvent.click(await screen.findByRole("button", { name: "내 사진 1" }));
    await userEvent.click(screen.getByRole("button", { name: "내 사진 1 삭제" }));
    await waitFor(() => expect(localStorage.getItem(KEY)).toBe('{"kind":"simple"}'));
    await act(async () => finishFirst());

    await waitFor(() =>
      expect(showCtaToast).toHaveBeenCalledWith("공간을 바꾸지 못했어요. 다시 시도해 주세요"),
    );
    expect(vi.mocked(putTimerBackground).mock.calls).toEqual([[41], [null]]);
    expect(localStorage.getItem(KEY)).toBe('{"kind":"simple"}');
    expect(screen.queryByTestId("watcher-background")).not.toBeInTheDocument();
  });
  it("감독 공간을 다른 감독 공간으로 바꾸면 앞 소리를 정리하고 새 소리를 깨우며, 정리한 소리는 다시 쓰지 않는다", async () => {
    const created: ReturnType<typeof makeSound>[] = [];
    vi.mocked(createWatcherSound).mockImplementation(() => {
      const next = makeSound();
      created.push(next);
      return next as never;
    });
    vi.mocked(getShopItems).mockResolvedValue({
      items: [
        shopSpace(),
        shopSpace({
          id: 44,
          code: "SPACE_LIBRARY",
          name: "도서관 감독관",
          assetKey: "watcher/5e6f7a8b",
        }),
      ],
    });
    localStorage.setItem(KEY, JSON.stringify(PROCTOR_SPACE));
    renderRoom();
    const first = created.at(-1)!;
    expect(first.prime).toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "공간" }));
    await userEvent.click(await screen.findByRole("button", { name: "도서관 감독관" }));

    const second = created.at(-1)!;
    expect(second).not.toBe(first);
    expect(first.dispose).toHaveBeenCalled();
    expect(second.prime).toHaveBeenCalled();
    const firstCalls = Object.values(first).map((fn) => fn.mock.calls.length);
    fireEvent.pointerDown(window);
    expect(Object.values(first).map((fn) => fn.mock.calls.length)).toEqual(firstCalls);
    expect(second.prime.mock.calls.length).toBeGreaterThan(1);
  });

  it("비집중 장면이 있는 반복 공간은 딴짓이 이어지면 비집중 장면을 드러내고, 그대로 공부를 끝내면 떠난 이벤트를 보낸다", async () => {
    localStorage.setItem(KEY, JSON.stringify(RAIN_SPACE));
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).endsWith("/spaces/loop/1a2b3c4d/manifest.json")
        ? new Response(
            JSON.stringify({
              version: 2,
              timing: { distractAfterSec: 3, returnAfterSec: 1 },
              focus: { visual: "video", loop: false },
              distract: { visual: "video", loop: "keep", cue: false, approach: false },
            }),
          )
        : new Response(JSON.stringify({ version: 1, sounds: [] })),
    );
    vi.useFakeTimers();
    try {
      render(
        <MemoryRouter initialEntries={["/room/7?userId=1&detector=mock"]}>
          <Routes>
            <Route path="/room/:id" element={<RoomPage />} />
            <Route path="/room/:id/result" element={<FocusFeaturesResult />} />
          </Routes>
        </MemoryRouter>,
      );
      answerCameraPrompt("camera");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      await act(async () => {
        window.__focusonMockDetector!.emit({ source: "PHONE", active: true });
        await vi.advanceTimersByTimeAsync(1_200);
      });
      const layer = screen.getByTestId("distract-space");
      expect(layer.querySelector("video")!.getAttribute("src")).toContain(
        "/spaces/loop/1a2b3c4d/distract/loop/",
      );
      expect(layer).toHaveClass("opacity-0");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(layer).toHaveClass("opacity-100");
      expect(trackSpaceDistractSceneEntered).toHaveBeenCalledExactlyOnceWith({
        itemCode: "SPACE_RAIN",
        trigger: "PHONE",
      });

      fireEvent.click(screen.getByRole("button", { name: "공부 종료" }));
      fireEvent.click(
        within(screen.getByRole("alertdialog")).getByRole("button", { name: "공부 종료" }),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(trackSpaceDistractSceneLeft).toHaveBeenCalledExactlyOnceWith({
      itemCode: "SPACE_RAIN",
      durationSec: expect.any(Number),
    });
  });

  // 집중 영상이 쌓이면 iPhone에서 영상 디코더가 메모리를 다 써서 세션 화면이 멈춘다.
  it("비집중 장면이 뜬 뒤 심플 모드를 여러 번 바꿔도 집중 영상과 비집중 영상은 하나씩이다", async () => {
    localStorage.setItem(KEY, JSON.stringify(RAIN_SPACE));
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).endsWith("/spaces/loop/1a2b3c4d/manifest.json")
        ? new Response(
            JSON.stringify({
              version: 2,
              timing: { distractAfterSec: 3, returnAfterSec: 1 },
              focus: { visual: "video", loop: false },
              distract: { visual: "video", loop: "keep", cue: false, approach: false },
            }),
          )
        : new Response(JSON.stringify({ version: 1, sounds: [] })),
    );
    vi.useFakeTimers();
    try {
      render(
        <MemoryRouter initialEntries={["/room/7?userId=1&detector=mock"]}>
          <Routes>
            <Route path="/room/:id" element={<RoomPage />} />
          </Routes>
        </MemoryRouter>,
      );
      answerCameraPrompt("camera");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        window.__focusonMockDetector!.emit({ source: "PHONE", active: true });
        await vi.advanceTimersByTimeAsync(1_200);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(screen.getByTestId("distract-space")).toHaveClass("opacity-100");

      for (let i = 0; i < 4; i++) {
        fireEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));
        await act(async () => {
          await vi.advanceTimersByTimeAsync(400);
        });
      }

      const sources = [...document.querySelectorAll("video[src]")].map((video) =>
        video.getAttribute("src"),
      );
      expect(sources.filter((src) => src!.includes("/1a2b3c4d/loop/"))).toHaveLength(1);
      expect(sources.filter((src) => src!.includes("/1a2b3c4d/distract/loop/"))).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("비집중 영상을 받지 못하면 딴짓이 이어져도 화면과 소리 모두 집중 장면에 머문다", async () => {
    localStorage.setItem(KEY, JSON.stringify(RAIN_SPACE));
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).endsWith("/spaces/loop/1a2b3c4d/manifest.json")
        ? new Response(
            JSON.stringify({
              version: 2,
              timing: { distractAfterSec: 3, returnAfterSec: 1 },
              focus: { visual: "video", loop: true },
              distract: { visual: "video", loop: "own", cue: false, approach: false },
            }),
          )
        : new Response(JSON.stringify({ version: 1, sounds: [] })),
    );
    vi.useFakeTimers();
    try {
      render(
        <MemoryRouter initialEntries={["/room/7?userId=1&detector=mock"]}>
          <Routes>
            <Route path="/room/:id" element={<RoomPage />} />
          </Routes>
        </MemoryRouter>,
      );
      answerCameraPrompt("camera");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        window.__focusonMockDetector!.emit({ source: "PHONE", active: true });
        await vi.advanceTimersByTimeAsync(1_200);
      });

      fireEvent.error(screen.getByTestId("distract-space").querySelector("video")!);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_000);
      });

      expect(screen.queryByTestId("distract-space")).toBeNull();
      expect(trackSpaceDistractSceneEntered).not.toHaveBeenCalled();
      expect(loopSoundFor("/1a2b3c4d/sound/loop").fade).not.toHaveBeenCalledWith(0);
      expect(loopSoundFor("/1a2b3c4d/distract/sound/loop").fade).not.toHaveBeenCalledWith(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // 집중 반복 소리가 없는 공간도 비집중 장면에 소리가 있으면 음량을 미리 맞출 수 있어야 한다.
  it.each([
    {
      name: "집중 소리 없이 비집중 소리만 있는 v2 공간",
      manifest: {
        version: 2,
        timing: { distractAfterSec: 3, returnAfterSec: 1 },
        focus: { visual: "video", loop: false },
        distract: { visual: "video", loop: "own", cue: false, approach: false },
      },
      enabled: true,
    },
    { name: "소리 없는 v1 반복 공간", manifest: { version: 1, sound: false }, enabled: false },
  ])("공간 음량 줄 켜짐 $enabled: $name", async ({ manifest, enabled }) => {
    localStorage.setItem(KEY, JSON.stringify(RAIN_SPACE));
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).endsWith("/spaces/loop/1a2b3c4d/manifest.json")
        ? new Response(JSON.stringify(manifest))
        : new Response(JSON.stringify({ version: 1, sounds: [] })),
    );
    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "공간" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/spaces/loop/1a2b3c4d/manifest.json"),
      ),
    );
    await act(async () => {});

    const slider = await screen.findByRole("slider", { name: "공간 음량" });
    if (enabled) await waitFor(() => expect(slider).toBeEnabled());
    else expect(slider).toBeDisabled();
  });
});
