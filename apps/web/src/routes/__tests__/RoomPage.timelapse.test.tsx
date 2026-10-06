import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  PhotoTap,
  VisionFocusDetector,
} from "@/features/study-session/adapters/focusDetector";
import { RoomPage } from "../RoomPage";

/**
 * 타임랩스 촬영의 RoomPage 연결만 본다.
 * 촬영 규칙은 `timelapseRecorder.test.ts`와 `visionFocusDetector.test.ts`가 본다.
 */
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => ({ settled: true, restored: null }),
}));

vi.mock("@/features/study-session/submitStudySession", () => ({
  submitStudySession: vi.fn(async () => []),
}));

const recorder = vi.hoisted(() => ({
  photoTap: {
    due: vi.fn<PhotoTap["due"]>(() => null),
    save: vi.fn<PhotoTap["save"]>(),
    fail: vi.fn<PhotoTap["fail"]>(),
  },
  begin: vi.fn<(startedAtMs: number) => void>(),
  finish: vi.fn<(ended: { startedAtMs: number }) => void>(),
  idle: async () => {},
}));
const createTimelapseRecorder = vi.hoisted(() => vi.fn(() => recorder));

vi.mock("@/features/timelapse/timelapseRecorder", () => ({ createTimelapseRecorder }));

/**
 * 비전 감지기 대역
 *
 * jsdom에는 카메라가 없어 진짜 감지 루프는 프레임을 받지 못한다.
 * 그래서 돌고 있는 동안 1초마다 촬영 창구에 차례를 묻는 루프만 흉내 낸다.
 */
const vision = vi.hoisted(() => {
  const PHOTO = new Uint8Array([0xff, 0xd8]).buffer;
  let tap: PhotoTap | undefined;
  let timer: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
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
    start() {
      if (timer !== null) {
        return;
      }
      timer = setInterval(() => {
        if (tap?.due() !== null) {
          tap?.save(PHOTO);
        }
      }, 1_000);
    },
    stop,
    close: stop,
  };
  return {
    detector,
    setTap(next: PhotoTap | undefined) {
      tap = next;
    },
  };
});

vi.mock("@/features/study-session/useVisionReadyTracking", () => ({
  useTrackedVisionDetector: (_video: unknown, _roomType: unknown, photoTap?: PhotoTap) => {
    vision.setTap(photoTap);
    return { visionDetector: vision.detector, visionReady: null };
  },
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

/** 화면 꺼짐·백그라운드 전환을 jsdom에서 재현한다(Page Visibility API). */
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("RoomPage 타임랩스 연결", () => {
  it("타임랩스 빌드면 세션 시작 시각으로 기록을 열고 끝날 때 한 번 알린다", async () => {
    vi.stubEnv("VITE_TIMELAPSE", "on");
    renderRoom();

    await waitFor(() => {
      expect(recorder.begin).toHaveBeenCalledWith(expect.any(Number));
    });
    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));
    await userEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "공부 종료" }),
    );

    await waitFor(() => {
      expect(recorder.finish).toHaveBeenCalledTimes(1);
    });
    expect(recorder.finish.mock.calls[0]?.[0].startedAtMs).toBe(recorder.begin.mock.calls[0]?.[0]);
  });

  it("타임랩스 빌드가 아니면 촬영을 만들지 않는다", () => {
    // 로컬 `.env.local`이 플래그를 켜 두어도 이 테스트는 꺼진 빌드를 본다.
    vi.stubEnv("VITE_TIMELAPSE", "");
    renderRoom();

    expect(createTimelapseRecorder).not.toHaveBeenCalled();
  });

  it("일시정지와 백그라운드 전환 중에는 사진을 저장하지 않고 다시 시작하면 이어 찍는다", async () => {
    vi.stubEnv("VITE_TIMELAPSE", "on");
    vi.useFakeTimers();
    const { due, save } = recorder.photoTap;
    due.mockReturnValue({ aspect: "9:16", mask: false });
    try {
      renderRoom();
      await tick(3_000);
      expect(save).toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
      save.mockClear();
      await tick(3_000);
      expect(save).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "다시 시작" }));
      await tick(3_000);
      expect(save).toHaveBeenCalled();

      act(() => {
        setVisibility("hidden");
      });
      save.mockClear();
      await tick(3_000);
      // 복귀해도 사용자가 다시 시작을 누르기 전까지는 일시정지다.
      act(() => {
        setVisibility("visible");
      });
      await tick(3_000);
      expect(save).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "다시 시작" }));
      await tick(3_000);
      expect(save).toHaveBeenCalled();
    } finally {
      due.mockReturnValue(null);
      vi.useRealTimers();
      setVisibility("visible");
    }
  });
});
