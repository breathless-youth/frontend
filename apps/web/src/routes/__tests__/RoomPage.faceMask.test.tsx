import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { VisionFocusDetector } from "@/features/study-session/adapters/focusDetector";
import type { FaceSpot } from "@/features/study-session/vision/faceSpot";
import { RoomPage } from "../RoomPage";

/**
 * 싱글룸 얼굴 가리기의 RoomPage 연결만 본다.
 * 그리기 규칙은 `FaceMaskOverlay.test.tsx`, 창 문구는 `CameraOnConfirmDialog.test.tsx`가 본다.
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

vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));

const amplitude = vi.hoisted(() => ({
  trackStudySessionCameraPromptShown: vi.fn(),
  trackStudySessionCameraPromptAnswered: vi.fn(),
  trackStudySessionFaceMaskToggled: vi.fn(),
  trackStudySessionFaceMaskEmojiSelected: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...amplitude,
}));

/**
 * 비전 감지기 대역
 *
 * jsdom에는 카메라가 없어 진짜 감지기는 위치를 내지 않는다.
 * 그래서 구독자를 모아 두고 테스트가 위치를 직접 흘려 넣는다.
 * 진짜 감지기처럼 멈추면 위치를 비운다.
 */
const vision = vi.hoisted(() => {
  const spotListeners = new Set<(spot: FaceSpot | null) => void>();
  const emitSpot = (spot: FaceSpot | null) => {
    for (const listener of spotListeners) listener(spot);
  };
  const state = { stopClearsSpot: true };
  const detector: VisionFocusDetector = {
    status: "ready",
    runtime: "main",
    assetTimings: [],
    faceStatus: "ready",
    eyeCalibration: null,
    subscribe: () => () => {},
    subscribeStatus: () => () => {},
    subscribeRuntimeFallback: () => () => {},
    subscribeFaceStatus: () => () => {},
    subscribeFaceSpot(listener) {
      spotListeners.add(listener);
      return () => {
        spotListeners.delete(listener);
      };
    },
    setPreviewOnly: () => {},
    preload: () => {},
    start: () => {},
    stop() {
      if (state.stopClearsSpot) emitSpot(null);
    },
    close: () => {},
  };
  return { detector, spotListeners, emitSpot, state };
});

vi.mock("@/features/study-session/useVisionReadyTracking", () => ({
  useTrackedVisionDetector: () => ({ visionDetector: vision.detector, visionReady: null }),
}));

const SPOT: FaceSpot = { x: 0.5, y: 0.3, size: 0.25, aspect: 16 / 9, visible: true };

function renderRoom() {
  return render(
    <MemoryRouter initialEntries={["/room/7?userId=1"]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const cameraSurface = () => document.querySelector<HTMLElement>('[data-session-surface="camera"]');
const surfaceMaskMode = () =>
  cameraSurface()?.querySelector("[data-face-mask]")?.getAttribute("data-face-mask");
const surfaceStream = () => cameraSurface()?.querySelector("video")?.srcObject ?? null;

/** 하드웨어가 있는 것처럼 `navigator`를 스텁한다(`RoomPage.test.tsx`와 같은 방식). */
function stubWorkingCamera() {
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
        getVideoTracks: () => [],
      })),
      enumerateDevices: vi.fn(async () => [{ kind: "videoinput" }, { kind: "videoinput" }]),
    },
  });
}

/** 저장된 켬 상태로 들어간 뒤 위치를 흘려 공부 화면에 이모지를 붙인다. */
async function enterWithStickerShown() {
  localStorage.setItem("focusmakers.singleFaceMask", "on");
  renderRoom();
  act(() => vision.emitSpot(SPOT));
  fireEvent.load(within(cameraSurface()!).getByTestId("face-mask-emoji"));
  expect(surfaceMaskMode()).toBe("sticker");
}

describe("RoomPage 얼굴 가리기", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vision.state.stopClearsSpot = true;
  });

  // 싱글룸에는 가리기를 바꾸는 화면이 없어 저장된 설정만 읽는다.
  it("저장된 가리기와 이모지로 들어오면 확인 창 없이 공부 화면을 가린다", () => {
    localStorage.setItem("focusmakers.singleFaceMask", "on");
    localStorage.setItem("focusmakers.singleFaceMaskEmoji", "cat");
    renderRoom();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    act(() => vision.emitSpot(SPOT));

    const emoji = within(cameraSurface()!).getByTestId("face-mask-emoji");
    expect(emoji).toHaveAttribute("src", "/face-mask/cat.png");
    expect(emoji.style.left).toBe("50%");
  });

  it("가리기를 꺼 두었으면 위치를 구독하지 않는다", () => {
    renderRoom();

    expect(vision.spotListeners.size).toBe(0);
    expect(within(cameraSurface()!).queryByTestId("face-mask-emoji")).toBeNull();
  });

  it("이모지가 붙은 뒤 일시정지하면 감지기가 멈추며 위치가 비고, 재개해도 옛 위치 대신 흐림이다", async () => {
    await enterWithStickerShown();

    await userEvent.click(screen.getByRole("button", { name: "일시정지" }));
    // 일시정지 동안은 카메라가 꺼지고 미리보기 창도 걷힌다.
    expect(cameraSurface()).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "다시 시작" }));

    expect(surfaceMaskMode()).toBe("blur");
  });

  // 감지기가 위치를 비우지 않은 채 카메라만 바뀌어도 이전 카메라 기준 위치가 새 영상 위에 남지 않아야 한다.
  it("카메라 스트림이 바뀌면 이전 위치를 다시 쓰지 않는다", async () => {
    stubWorkingCamera();
    vision.state.stopClearsSpot = false;
    await enterWithStickerShown();
    await waitFor(() => expect(surfaceStream()).toBeTruthy());
    const before = surfaceStream();

    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "카메라 전환" }));

    await waitFor(() => expect(surfaceStream()).not.toBe(before));
    expect(surfaceStream()).toBeTruthy();
    expect(surfaceMaskMode()).toBe("blur");
  });
});
