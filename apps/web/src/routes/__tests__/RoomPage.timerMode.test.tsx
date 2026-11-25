import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeFaceMaskOn } from "@/features/live-room/faceMaskSettings";
import { readMeasureMode, writeMeasureMode } from "@/features/measure-mode/measureMode";
import type {
  PhotoTap,
  VisionFocusDetector,
} from "@/features/study-session/adapters/focusDetector";
import { createDevMockDetector } from "@/features/study-session/devMockDetector";
import type { RestoredSession } from "@/features/study-session/restoreActiveSession";
import { markSessionGuideSeen } from "@/features/study-session/sessionGuide";
import { setSessionCountdownSecondsForTest } from "@/features/study-session/sessionCountdown";
import { AWAY_LIMIT_MS } from "@/features/study-session/sessionTuning";
import { submitStudySession } from "@/features/study-session/submitStudySession";
import { trackStudySessionEnded } from "@/lib/amplitude";
import { postToNative } from "@/lib/bridge";
import { RoomPage } from "../RoomPage";

/**
 * 카메라 없이 타이머로만 측정하는 세션 화면의 RoomPage 연결만 본다.
 * 측정 방식은 홈 시작 버튼이나 앱의 권한 거부 화면에서 고르고, 세션 화면은 저장된 방식과 주소를 따른다.
 * 카메라로 측정하는 세션은 다른 RoomPage 테스트가 지금 모습 그대로 본다.
 */
const restore = vi.hoisted(() => ({ restored: null as RestoredSession | null }));
vi.mock("@/features/study-session/useActiveSessionRestore", () => ({
  useActiveSessionRestore: () => ({ settled: true, restored: restore.restored }),
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

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  trackStudySessionEnded: vi.fn(),
}));

// 움직임 센서는 브리지로 앱에 켜 달라고 보내서 그 메시지를 센다.
vi.mock("@/lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  postToNative: vi.fn(),
}));

const recorder = vi.hoisted(() => ({
  photoTap: {
    due: () => null,
    save: () => {},
    fail: () => {},
  } satisfies PhotoTap,
  begin: vi.fn<(startedAtMs: number) => void>(),
  finish: vi.fn(),
  idle: async () => {},
}));
vi.mock("@/features/timelapse/timelapseRecorder", () => ({
  createTimelapseRecorder: () => recorder,
}));

const vision = vi.hoisted(() => {
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
    subscribeYawn: () => () => {},
    setPreviewOnly: () => {},
    preload: vi.fn(),
    start: vi.fn(),
    stop: () => {},
    close: () => {},
  };
  return { detector };
});
vi.mock("@/features/study-session/useVisionReadyTracking", () => ({
  useTrackedVisionDetector: () => ({ visionDetector: vision.detector, visionReady: null }),
}));

function renderRoom(url = "/room/7?userId=1") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** 카메라가 있는 기기처럼 꾸며 카메라를 여는지 센다. */
function stubWorkingCamera() {
  const getUserMedia = vi.fn(
    async () => ({ getTracks: () => [], getVideoTracks: () => [] }) as unknown as MediaStream,
  );
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia,
      enumerateDevices: vi.fn(async () => [{ kind: "videoinput" }]),
    },
  });
  return getUserMedia;
}

/** 화면 꺼짐·백그라운드 전환을 jsdom에서 재현한다(Page Visibility API). */
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

const motionSensorMessages = () =>
  vi.mocked(postToNative).mock.calls.filter(([message]) => message.type === "motion-sensor");

async function openMoreMenuItems() {
  await userEvent.click(screen.getByRole("button", { name: "더보기" }));
  return screen.getAllByRole("menuitem").map((item) => item.textContent);
}

async function endSession() {
  await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));
  await userEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", { name: "공부 종료" }),
  );
}

const flushEffects = () => new Promise((resolve) => setTimeout(resolve, 0));

const RESTORED_BASE = {
  startedAtMs: Date.now() - 60_000,
  reportedAtMs: Date.now() - 5_000,
  baseStudySec: 55,
  baseFocusSec: 55,
  events: [],
} satisfies RestoredSession;

describe("RoomPage 카메라 없는 모드", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ version: 1, sounds: [] }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    restore.restored = null;
    setVisibility("visible");
    setSessionCountdownSecondsForTest(0);
  });

  it("카메라와 작은 카메라 창 없이 타이머로 시작하고 시계는 공부 시간으로 보인다", async () => {
    const getUserMedia = stubWorkingCamera();
    writeMeasureMode("timer");

    renderRoom();

    expect(screen.getByText("현재 공부")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "내 화면 크게 보기" })).not.toBeInTheDocument();
    await flushEffects();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("AI 감지·움직임 센서·타임랩스를 시작하지 않고 일시정지나 백그라운드에서 돌아와도 카메라를 열지 않는다", async () => {
    const getUserMedia = stubWorkingCamera();
    writeMeasureMode("timer");
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "일시정지" }));
    await userEvent.click(screen.getByRole("button", { name: "다시 시작" }));
    act(() => setVisibility("hidden"));
    act(() => setVisibility("visible"));
    await flushEffects();

    expect(vision.detector.start).not.toHaveBeenCalled();
    expect(motionSensorMessages()).toEqual([]);
    expect(recorder.begin).not.toHaveBeenCalled();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("개발용 감지기 대역 주소로 열어도 감지 신호를 받지 않아 순공이 총 공부와 같다", async () => {
    vi.useFakeTimers();
    try {
      writeMeasureMode("timer");
      renderRoom("/room/7?userId=1&detector=mock");

      await act(async () => {
        createDevMockDetector()!.emit({ source: "PHONE", active: true });
        await vi.advanceTimersByTimeAsync(10_000);
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

    const ended = vi.mocked(trackStudySessionEnded).mock.calls[0]![0];
    expect(ended.distractionSec).toBe(0);
    expect(ended.focusSec).toBe(ended.studySec);
  });

  it("더보기에 카메라 전환과 시계 보기 바꾸기가 없다", async () => {
    writeMeasureMode("timer");
    renderRoom();

    const items = await openMoreMenuItems();

    expect(items).not.toContain("카메라 전환");
    expect(items).not.toContain("공부 시간으로 보기");
    expect(items).not.toContain("순공으로 보기");
  });

  it("순공 보기를 저장해 둔 기기여도 공부 시간으로 보인다", () => {
    localStorage.setItem("focuson.sessionClockView.v1", "focus");
    writeMeasureMode("timer");
    renderRoom();

    expect(screen.getByText("현재 공부")).toBeInTheDocument();
    expect(screen.queryByText("현재 집중")).not.toBeInTheDocument();
  });

  it("처음 보는 계정이어도 카메라 감지를 설명하는 첫 가이드를 띄우지 않고 봤다고 남기지도 않는다", () => {
    setSessionCountdownSecondsForTest(3);
    writeMeasureMode("timer");
    renderRoom();

    expect(screen.queryByRole("dialog", { name: "세션 도움말" })).not.toBeInTheDocument();
    expect(localStorage.getItem("focusmakers:session-guide:1")).toBeNull();
  });

  it("카메라 세션이면 처음 보는 계정에게 첫 가이드를 띄운다", () => {
    stubWorkingCamera();
    setSessionCountdownSecondsForTest(3);
    renderRoom();

    expect(screen.getByRole("dialog", { name: "세션 도움말" })).toBeInTheDocument();
  });

  it("끝내면 제출 요청에 측정 방식 TIMER를, 종료 이벤트에 timer를 싣는다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    writeFaceMaskOn("single", true);
    writeMeasureMode("timer");
    markSessionGuideSeen(1);
    renderRoom();

    await endSession();

    await waitFor(() => expect(trackStudySessionEnded).toHaveBeenCalledOnce());
    expect(vi.mocked(trackStudySessionEnded).mock.calls[0]?.[0]).toMatchObject({
      measureMode: "timer",
    });
    expect(vi.mocked(submitStudySession)).toHaveBeenCalledWith(
      expect.objectContaining({ source: "TIMER" }),
    );
  });

  it("앱 거부 화면에서 카메라 없이 열면 기기 설정이 카메라여도 카메라를 열지 않고 기기 설정을 타이머로 바꾼다", async () => {
    const getUserMedia = stubWorkingCamera();
    writeMeasureMode("camera");

    renderRoom("/room/7?userId=1&measureMode=timer");

    await flushEffects();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(readMeasureMode()).toBe("timer");
  });

  it("카메라로 측정하던 세션을 이어받으면 주소에 timer가 있어도 카메라를 열고 기기 설정을 바꾸지 않는다", async () => {
    const getUserMedia = stubWorkingCamera();
    restore.restored = { ...RESTORED_BASE, source: "MEASURED" };

    renderRoom("/room/7?userId=1&measureMode=timer");
    // 이어받은 세션은 일시정지로 열리고 다시 시작하면 카메라를 켠다.
    await userEvent.click(screen.getByRole("button", { name: "다시 시작" }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    expect(readMeasureMode()).toBe("camera");
  });

  it("타이머로 측정하던 세션을 이어받으면 기기 설정이 카메라여도 카메라를 열지 않는다", async () => {
    const getUserMedia = stubWorkingCamera();
    restore.restored = { ...RESTORED_BASE, source: "TIMER" };

    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "다시 시작" }));

    await flushEffects();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("카메라로 측정하던 세션을 이어받으면 기기 설정이 타이머여도 카메라·AI 감지·움직임 센서·타임랩스가 돈다", async () => {
    const getUserMedia = stubWorkingCamera();
    writeMeasureMode("timer");
    restore.restored = { ...RESTORED_BASE, source: "MEASURED" };

    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "다시 시작" }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    expect(vision.detector.start).toHaveBeenCalled();
    expect(motionSensorMessages()).not.toEqual([]);
    expect(recorder.begin).toHaveBeenCalled();
  });

  it("앱 밖에 2시간 넘게 있다 돌아오면 나간 시각에서 2시간까지 기록하고 그 사유를 안내한다", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(submitStudySession).mockResolvedValue([]);
      writeMeasureMode("timer");
      renderRoom();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      const leftAtMs = Date.now();
      act(() => setVisibility("hidden"));
      vi.setSystemTime(leftAtMs + AWAY_LIMIT_MS + 10 * 60_000);
      act(() => setVisibility("visible"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(vi.mocked(submitStudySession)).toHaveBeenCalledWith(
        expect.objectContaining({ endedAtMs: leftAtMs + AWAY_LIMIT_MS }),
      );
      expect(
        screen.getByText("앱 밖에 2시간 넘게 있어서 2시간까지 기록하고 공부를 마쳤어요"),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
