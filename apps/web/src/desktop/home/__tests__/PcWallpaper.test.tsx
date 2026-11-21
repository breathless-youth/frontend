import "fake-indexeddb/auto";

import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeTimerBackground } from "@/features/timer-background/timerBackground";
import {
  __resetTimerBackgroundPhotoStoreForTests,
  timerBackgroundPhotoStore,
} from "@/features/timer-background/timerBackgroundPhotos";
import { TIMER_BACKGROUND_PHOTOS_KEY } from "@/features/timer-background/timerBackgroundQueries";
import {
  clearWatcherAssets,
  readWatcherAsset,
} from "@/features/timer-background/watcher/watcherAssets";
import { queryClient } from "@/lib/queryClient";
import { PROCTOR_SPACE, RAIN_SPACE } from "@/test/spaceFixtures";

import { PcWallpaper } from "../PcWallpaper";

vi.mock("@/features/timer-background/watcher/watcherAssets", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  clearWatcherAssets: vi.fn(async () => {}),
  readWatcherAsset: vi.fn(async () => undefined),
}));

const PHOTO = { bytes: new ArrayBuffer(1), width: 1, height: 1 };

function renderWallpaper() {
  return render(
    <QueryClientProvider client={queryClient}>
      <PcWallpaper />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  globalThis.indexedDB = new IDBFactory();
  __resetTimerBackgroundPhotoStoreForTests();
  queryClient.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PcWallpaper", () => {
  it("처음에는 심플이라 사진을 깔지 않는다", () => {
    renderWallpaper();

    expect(screen.queryByTestId("timer-background-layer")).not.toBeInTheDocument();
  });

  it("내 사진을 고르면 바로 사진을 깐다", async () => {
    const photo = await timerBackgroundPhotoStore().add(PHOTO, 1);
    renderWallpaper();

    act(() => {
      writeTimerBackground({ kind: "photo", photoId: photo.id });
    });

    expect(await screen.findByTestId("timer-background-layer")).toBeInTheDocument();
  });

  it("고른 사진이 지워졌으면 심플로 그린다", async () => {
    writeTimerBackground({ kind: "photo", photoId: "gone" });
    renderWallpaper();

    await waitFor(() =>
      expect(queryClient.getQueryState([...TIMER_BACKGROUND_PHOTOS_KEY, "gone"])?.status).toBe(
        "success",
      ),
    );
    expect(screen.queryByTestId("timer-background-layer")).not.toBeInTheDocument();
  });

  it("사진을 읽다 실패하면 심플로 그린다", async () => {
    const get = vi
      .spyOn(timerBackgroundPhotoStore(), "get")
      .mockRejectedValue(new Error("read failed"));
    writeTimerBackground({ kind: "photo", photoId: "p1" });
    renderWallpaper();

    // 일반 오류는 한 번 다시 시도하므로 두 번째 실패까지 기다린다.
    await waitFor(
      () =>
        expect(queryClient.getQueryState([...TIMER_BACKGROUND_PHOTOS_KEY, "p1"])?.status).toBe(
          "error",
        ),
      { timeout: 3000 },
    );
    expect(get).toHaveBeenCalledWith("p1");
    expect(screen.queryByTestId("timer-background-layer")).not.toBeInTheDocument();
  });

  it("반복 영상 공간을 고르면 그 공간 영상을 깐다", () => {
    writeTimerBackground(RAIN_SPACE);
    const { container } = renderWallpaper();

    expect(container.querySelector("video")?.getAttribute("src")).toContain(
      `/spaces/${RAIN_SPACE.assetKey}/loop/`,
    );
  });

  it("그림 공간을 고르면 그림을 깔고, 받지 못하면 심플로 그린다", () => {
    const image = { ...RAIN_SPACE, assetType: "IMAGE", videoMode: null } as const;
    writeTimerBackground(image);
    const { container } = renderWallpaper();
    const img = container.querySelector("img")!;

    expect(img.getAttribute("src")).toContain(`/spaces/${image.assetKey}/image/`);
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
  });

  it("감시 공간을 고르면 감시 배경을 빈 방으로 깐다", () => {
    writeTimerBackground(PROCTOR_SPACE);
    renderWallpaper();

    const watcher = screen.getByTestId("watcher-background");
    expect(watcher.querySelector("img")?.getAttribute("src")).toContain(PROCTOR_SPACE.assetKey);
  });

  it("옛 감독관 값은 심플로 그리고 저장값을 심플로 바꾸며 감시 파일을 삭제한다", async () => {
    localStorage.setItem("focusmakers.timerBackground", '{"kind":"proctor"}');
    renderWallpaper();

    expect(screen.queryByTestId("watcher-background")).not.toBeInTheDocument();
    expect(localStorage.getItem("focusmakers.timerBackground")).toBe('{"kind":"simple"}');
    expect(clearWatcherAssets).toHaveBeenCalledOnce();
  });

  it("받지 못한 그림 공간도 다른 공간을 거쳐 다시 고르면 다시 그린다", () => {
    const image = { ...RAIN_SPACE, assetType: "IMAGE", videoMode: null } as const;
    writeTimerBackground(image);
    const { container } = renderWallpaper();
    fireEvent.error(container.querySelector("img")!);

    act(() => {
      writeTimerBackground({ kind: "simple" });
    });
    act(() => {
      writeTimerBackground(image);
    });

    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      `/spaces/${image.assetKey}/image/`,
    );
  });

  it("창이 낮아도 감시 포스터, 영상, 받아 둔 파일 주소는 태블릿 가로를 쓴다", async () => {
    vi.stubGlobal("innerWidth", 1200);
    vi.stubGlobal("innerHeight", 500);
    writeTimerBackground(PROCTOR_SPACE);
    renderWallpaper();
    const watcher = screen.getByTestId("watcher-background");

    expect(watcher.querySelector("source")).toBeNull();
    expect(watcher.querySelector("img")?.getAttribute("src")).toBe(
      `/spaces/${PROCTOR_SPACE.assetKey}/poster/tablet_landscape.jpg`,
    );
    const sources = [...watcher.querySelectorAll("video")].map((video) => video.src);
    expect(sources.some((src) => src.endsWith("/enter/tablet_landscape.mp4"))).toBe(true);
    await waitFor(() => expect(readWatcherAsset).toHaveBeenCalled());
    const read = vi.mocked(readWatcherAsset).mock.calls.map(([url]) => url);
    expect(read).toContain(`/spaces/${PROCTOR_SPACE.assetKey}/enter/tablet_landscape.mp4`);
    expect(read.some((url) => url.includes("phone_"))).toBe(false);
  });
});
