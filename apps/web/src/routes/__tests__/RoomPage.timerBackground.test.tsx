import "fake-indexeddb/auto";

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeTimerBackground } from "@/features/timer-background/timerBackground";
import {
  __resetTimerBackgroundPhotoStoreForTests,
  timerBackgroundPhotoStore,
} from "@/features/timer-background/timerBackgroundPhotos";

import { RoomPage } from "../RoomPage";

/** 설정 화면이 고른 타이머 배경이 공부 화면 뒤에 깔리는지만 본다. 선택·미리보기는 `TimerBackgroundSettingsPage.test.tsx`가 본다. */
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => ({ settled: true, restored: null }),
}));

vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(),
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

async function choosePhoto(fit = { scale: 2, x: 10, y: 80 }) {
  const photo = await timerBackgroundPhotoStore().add(
    { bytes: new Uint8Array([1]).buffer, width: 1000, height: 1000 },
    1,
  );
  await timerBackgroundPhotoStore().updateFit(photo.id, fit);
  writeTimerBackground({ kind: "photo", photoId: photo.id });
}

describe("RoomPage — 타이머 배경", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    __resetTimerBackgroundPhotoStoreForTests();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("고른 사진을 조정값대로 기본 모드 공부 화면 뒤에 깐다", async () => {
    await choosePhoto();
    renderRoom();

    const layer = await screen.findByTestId("timer-background-layer");
    const image = layer.querySelector("img")!;
    expect(image.style.transform).toBe("scale(2)");
    expect(image.style.objectPosition).toBe("10% 80%");
    expect(image).toHaveClass("amp-block", "sentry-block");
  });

  it("심플 모드와 카메라를 키운 화면에는 배경을 깔지 않는다", async () => {
    await choosePhoto();
    renderRoom();
    await screen.findByTestId("timer-background-layer");

    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));
    expect(screen.queryByTestId("timer-background-layer")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));
    await userEvent.click(screen.getByRole("button", { name: "내 화면 크게 보기" }));
    expect(screen.queryByTestId("timer-background-layer")).toBeNull();
  });

  it("카메라를 키우는 움직임 동안에는 배경을 남겨 두고, 다 커지면 걷는다", async () => {
    await choosePhoto();
    let finish = () => {};
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    Element.prototype.animate = vi.fn(() => ({ finished, cancel: vi.fn() })) as never;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 402,
      height: 874,
    } as DOMRect);
    try {
      renderRoom();
      await screen.findByTestId("timer-background-layer");

      await userEvent.click(screen.getByRole("button", { name: "내 화면 크게 보기" }));
      expect(screen.getByTestId("timer-background-layer")).toBeInTheDocument();

      await act(async () => finish());
      expect(screen.queryByTestId("timer-background-layer")).toBeNull();
    } finally {
      delete (Element.prototype as Partial<Element>).animate;
      vi.restoreAllMocks();
    }
  });

  it("심플을 골랐거나 고른 사진이 지워졌으면 배경이 없다", async () => {
    writeTimerBackground({ kind: "photo", photoId: "gone" });
    renderRoom();

    await screen.findByRole("button", { name: "심플 모드 전환" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId("timer-background-layer")).toBeNull();
  });
});
