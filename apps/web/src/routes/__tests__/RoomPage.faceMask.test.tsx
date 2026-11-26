import { act, cleanup, render, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { VisionFocusDetector } from "@/features/study-session/adapters/focusDetector";
import type { FaceSpot } from "@/features/study-session/vision/faceSpot";
import { RoomPage } from "../RoomPage";

/**
 * 싱글룸이 얼굴 가리기를 쓰지 않는지 본다.
 * 그리기 규칙은 `FaceMaskOverlay.test.tsx`가 본다.
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

/**
 * 비전 감지기 대역
 *
 * jsdom에는 카메라가 없어 진짜 감지기는 위치를 내지 않는다.
 * 그래서 구독자를 모아 두고 테스트가 위치를 직접 흘려 넣는다.
 */
const vision = vi.hoisted(() => {
  const spotListeners = new Set<(spot: FaceSpot | null) => void>();
  const emitSpot = (spot: FaceSpot | null) => {
    for (const listener of spotListeners) listener(spot);
  };
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
    subscribeYawn: () => () => {},
    subscribeFaceSpot(listener) {
      spotListeners.add(listener);
      return () => {
        spotListeners.delete(listener);
      };
    },
    setPreviewOnly: () => {},
    preload: () => {},
    start: () => {},
    stop: () => {},
    close: () => {},
  };
  return { detector, spotListeners, emitSpot };
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

describe("RoomPage 얼굴 가리기", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  // 싱글룸에는 가리기를 바꾸는 화면이 없어, 예전에 켜 둔 값이 남아 있으면 끌 수 없다.
  it("예전에 켜 둔 가리기가 저장돼 있어도 싱글룸 공부 화면은 가리지도 흐리지도 않는다", () => {
    localStorage.setItem("focusmakers.singleFaceMask", "on");
    localStorage.setItem("focusmakers.singleFaceMaskEmoji", "cat");
    renderRoom();

    expect(vision.spotListeners.size).toBe(0);
    act(() => vision.emitSpot(SPOT));
    expect(surfaceMaskMode()).toBe("plain");
    expect(within(cameraSurface()!).queryByTestId("face-mask-emoji")).toBeNull();
  });
});
