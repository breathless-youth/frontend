import "fake-indexeddb/auto";

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_TIMELAPSE_SETTINGS,
  saveTimelapseSettings,
} from "@/features/timelapse/timelapseSettings";
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

  it("월페이퍼가 있으면 심플 모드에서도 그림을 둔 채 카메라 창만 빼고, 하단 버튼 톤을 낮춘다", async () => {
    writeTimerBackground({ kind: "proctor" });
    renderRoom();
    const watcher = await screen.findByTestId("watcher-background");
    const background = screen.getByTestId("timer-background");
    const camera = () => document.querySelector('[data-session-surface="camera"]');
    expect(camera()).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));
    expect(camera()).toBeNull();
    expect(screen.queryByRole("button", { name: "내 화면 크게 보기" })).toBeNull();
    expect(background).not.toHaveClass("opacity-0");
    expect(screen.getByTestId("watcher-background")).toBe(watcher);
    expect(screen.getByText("순공")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "일시정지" })).toHaveClass("bg-white/14");
    expect(screen.getByRole("button", { name: "공부 종료" })).toHaveClass("bg-white/14");

    // 일시정지에서는 다시 시작 버튼만 원래 색으로 돌아온다.
    await userEvent.click(screen.getByRole("button", { name: "일시정지" }));
    expect(screen.getByRole("button", { name: "다시 시작" })).toHaveClass(
      "bg-(--session-control-resume-bg)",
    );
    await userEvent.click(screen.getByRole("button", { name: "다시 시작" }));

    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));
    expect(camera()).not.toBeNull();
    expect(screen.getByRole("button", { name: "공부 종료" })).toHaveClass(
      "bg-(--session-control-exit-bg)",
    );
    await userEvent.click(screen.getByRole("button", { name: "내 화면 크게 보기" }));
    expect(background).toHaveClass("invisible");
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
      expect(screen.getByTestId("timer-background")).not.toHaveClass("invisible");

      await act(async () => finish());
      expect(screen.getByTestId("timer-background")).toHaveClass("invisible");
    } finally {
      delete (Element.prototype as Partial<Element>).animate;
      vi.restoreAllMocks();
    }
  });

  it("월페이퍼 위에서는 시간 묶음이 오늘 누적·순공·집중률을 늘 보여 주고 ⓘ 버튼이 없다", async () => {
    writeTimerBackground({ kind: "proctor" });
    renderRoom();
    await screen.findByTestId("watcher-background");

    expect(screen.getByText("순공")).toBeInTheDocument();
    expect(screen.getByTestId("session-focus-rate")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "순공시간·집중률 보기" })).toBeNull();
  });

  it("월페이퍼에서 타임랩스를 켜고 카메라를 키우면 필이 과목 줄 아래로 올라간다", async () => {
    await saveTimelapseSettings({ ...DEFAULT_TIMELAPSE_SETTINGS, enabled: true });
    try {
      writeTimerBackground({ kind: "proctor" });
      renderRoom();
      const expand = await screen.findByRole("button", { name: "내 화면 크게 보기" });
      await waitFor(() => expect(expand).toHaveTextContent("타임랩스"));

      await userEvent.click(expand);

      const pill = screen.getByText("타임랩스");
      const shrink = screen.getByRole("button", { name: "작게 보기" });
      // 줄이기 버튼 줄이 아니라 머리 줄 다음에 놓인다.
      expect(shrink.parentElement!.contains(pill)).toBe(false);
      expect(pill.compareDocumentPosition(shrink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    } finally {
      await saveTimelapseSettings(DEFAULT_TIMELAPSE_SETTINGS);
    }
  });

  it("월페이퍼 위 순공은 집중하지 않는 동안 회색으로 멈춘다", async () => {
    writeTimerBackground({ kind: "proctor" });
    renderRoom();
    await screen.findByTestId("watcher-background");
    expect(screen.getByTestId("session-focus-time")).toHaveClass("text-white");

    await userEvent.click(screen.getByRole("button", { name: "일시정지" }));

    expect(screen.getByTestId("session-focus-time")).toHaveClass("text-text-tertiary");
  });

  it("배경 없이 심플을 고르면 가운데 묶음이다", async () => {
    renderRoom();
    await screen.findByRole("button", { name: "심플 모드 전환" });

    expect(screen.getByRole("button", { name: "순공시간·집중률 보기" })).toBeInTheDocument();
    expect(screen.queryByTestId("wallpaper-scrim")).toBeNull();

    // 심플 모드의 하단 버튼은 배경이 없어도 같은 유리 원이다(시안 18i).
    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));
    expect(screen.getByRole("button", { name: "일시정지" })).toHaveClass("bg-white/14");
    expect(screen.getByRole("button", { name: "공부 종료" })).toHaveClass("bg-white/14");
  });

  it("심플을 골랐거나 고른 사진이 지워졌으면 배경이 없다", async () => {
    writeTimerBackground({ kind: "photo", photoId: "gone" });
    renderRoom();

    await screen.findByRole("button", { name: "심플 모드 전환" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId("timer-background-layer")).toBeNull();
  });
});
