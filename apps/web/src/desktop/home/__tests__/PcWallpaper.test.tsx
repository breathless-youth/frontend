import "fake-indexeddb/auto";

import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeTimerBackground } from "@/features/timer-background/timerBackground";
import {
  __resetTimerBackgroundPhotoStoreForTests,
  timerBackgroundPhotoStore,
} from "@/features/timer-background/timerBackgroundPhotos";
import { TIMER_BACKGROUND_PHOTOS_KEY } from "@/features/timer-background/timerBackgroundQueries";
import { queryClient } from "@/lib/queryClient";

import { PcWallpaper } from "../PcWallpaper";

const PHOTO = { bytes: new ArrayBuffer(1), width: 1, height: 1 };

function renderWallpaper() {
  render(
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
});
