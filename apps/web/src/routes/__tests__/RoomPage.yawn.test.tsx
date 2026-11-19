import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { VisionFocusDetector } from "@/features/study-session/adapters/focusDetector";
import { submitStudySession } from "@/features/study-session/submitStudySession";
import type { Yawn } from "@/features/study-session/vision/yawnTracker";
import { RoomPage } from "../RoomPage";

/**
 * 하품 기록의 RoomPage 연결만 본다 — 이어받은 세션이 이어받기 전 하품을 이어서 싣는지.
 * 하품 판정은 `yawnTracker.test.ts`, 제출 규칙은 `submitStudySession.test.ts`가 본다.
 */
const restoredYawn = vi.hoisted(() => {
  const startedAtMs = Date.now() - 130_000;
  return {
    startedAtMs,
    observation: {
      type: "YAWN" as const,
      startedAt: new Date(startedAtMs + 10_000).toISOString(),
      endedAt: new Date(startedAtMs + 14_000).toISOString(),
    },
  };
});

vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => ({
    settled: true,
    restored: {
      startedAtMs: restoredYawn.startedAtMs,
      reportedAtMs: Date.now(),
      baseStudySec: 130,
      baseFocusSec: 130,
      events: [],
      observations: [restoredYawn.observation],
    },
  }),
}));

vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(async () => []),
}));

vi.mock("@/features/timelapse/timelapseRecorder", () => ({
  createTimelapseRecorder: () => ({
    photoTap: { due: () => null, save: () => {}, fail: () => {} },
    begin: () => {},
    finish: () => {},
    idle: async () => {},
  }),
}));

/** 하품 구독자를 붙잡아 두었다가 테스트가 하품 하나를 끝낼 수 있게 하는 감지기 대역. */
const vision = vi.hoisted(() => {
  const listeners = new Set<(yawn: Yawn) => void>();
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
    subscribeFaceSpot: () => () => {},
    subscribeYawn: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setPreviewOnly: () => {},
    preload: () => {},
    start: () => {},
    stop: () => {},
    close: () => {},
  };
  return {
    detector,
    yawn(yawn: Yawn) {
      for (const listener of listeners) {
        listener(yawn);
      }
    },
  };
});

vi.mock("@/features/study-session/useVisionReadyTracking", () => ({
  useTrackedVisionDetector: () => ({ visionDetector: vision.detector, visionReady: null }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("RoomPage 하품 연결", () => {
  it("이어받은 세션은 이어받기 전 하품과 이어받은 뒤 하품을 함께 제출한다", async () => {
    render(
      <MemoryRouter initialEntries={["/room/7?userId=1"]}>
        <Routes>
          <Route path="/room/:id" element={<RoomPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const nowMs = Date.now();
    act(() => {
      vision.yawn({ startedAtMs: nowMs - 5_000, endedAtMs: nowMs - 1_000, peak: 0.5 });
    });

    await userEvent.click(await screen.findByRole("button", { name: "공부 종료" }));
    await userEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "공부 종료" }),
    );

    await waitFor(() => {
      expect(submitStudySession).toHaveBeenCalled();
    });
    expect(vi.mocked(submitStudySession).mock.calls[0]?.[0].observations).toEqual([
      restoredYawn.observation,
      {
        type: "YAWN",
        startedAt: new Date(nowMs - 5_000).toISOString(),
        endedAt: new Date(nowMs - 1_000).toISOString(),
      },
    ]);
  });
});
