import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeFaceMaskOn } from "@/features/live-room/faceMaskSettings";
import { writeMeasureMode } from "@/features/measure-mode/measureMode";
import type {
  PhotoTap,
  VisionFocusDetector,
} from "@/features/study-session/adapters/focusDetector";
import { createDevMockDetector } from "@/features/study-session/devMockDetector";
import type { RestoredSession } from "@/features/study-session/restoreActiveSession";
import { trackSessionSimpleModeToggled, trackStudySessionEnded } from "@/lib/amplitude";
import { postToNative } from "@/lib/bridge";
import { answerCameraPrompt, CAMERA_PROMPT_NAME } from "@/test/cameraPrompt";
import { RoomPage } from "../RoomPage";

/**
 * 카메라 없이 타이머로만 측정하는 세션 화면의 RoomPage 연결만 본다.
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
  trackSessionSimpleModeToggled: vi.fn(),
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
    setPreviewOnly: () => {},
    preload: () => {},
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

const cameraPrompt = () => screen.queryByRole("alertdialog", { name: CAMERA_PROMPT_NAME });

async function openMoreMenuItems() {
  await userEvent.click(screen.getByRole("button", { name: "더보기" }));
  return screen.getAllByRole("menuitem").map((item) => item.textContent);
}

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
  });

  it("카메라를 열지 않고 카메라 확인 창과 상태 문구 없이 타이머로 시작한다", async () => {
    const getUserMedia = stubWorkingCamera();
    writeMeasureMode("timer");

    renderRoom();

    expect(screen.getByText("00:00:00")).toBeInTheDocument();
    expect(cameraPrompt()).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
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
    await new Promise((resolve) => setTimeout(resolve, 0));

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

  it("화면 탭으로 일반 모드에 가도 작은 카메라 창 없이 조작 버튼이 동작하고 메뉴에 카메라 항목이 없다", async () => {
    writeMeasureMode("timer");
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));

    expect(screen.getByRole("button", { name: "심플 모드 전환" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.queryByRole("button", { name: "내 화면 크게 보기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(await openMoreMenuItems()).toEqual(["플래너"]);
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "일시정지" }));
    expect(screen.getByRole("button", { name: "다시 시작" })).toBeInTheDocument();
  });

  it("일반 모드에서도 총 공부 줄을 두지 않고 큰 숫자를 총 공부 시간으로 읽어 준다", async () => {
    writeMeasureMode("timer");
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "심플 모드 전환" }));

    expect(screen.getByText("00:00:00")).toBeInTheDocument();
    expect(screen.queryByText("총 00:00:00")).not.toBeInTheDocument();
    expect(screen.getByText(/^총 공부 시간 /)).toBeInTheDocument();
    expect(screen.queryByText(/^순공시간 /)).not.toBeInTheDocument();
  });

  it("심플 모드로 돌아갈 때 없는 카메라 창을 전환 출발점으로 남기지 않는다", async () => {
    writeMeasureMode("timer");
    renderRoom();
    const toggle = screen.getByRole("button", { name: "심플 모드 전환" });

    await userEvent.click(toggle);
    await userEvent.click(toggle);

    const [on, from] = vi.mocked(trackSessionSimpleModeToggled).mock.lastCall ?? [];
    expect(on).toBe(true);
    expect(from).toBeUndefined();
  });

  it("얼굴 가림을 켜 둔 기기여도 종료 이벤트의 얼굴 가림은 꺼짐이다", async () => {
    writeFaceMaskOn("single", true);
    writeMeasureMode("timer");
    renderRoom();

    await userEvent.click(screen.getByRole("button", { name: "공부 종료" }));
    await userEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "공부 종료" }),
    );

    await waitFor(() => expect(trackStudySessionEnded).toHaveBeenCalledOnce());
    expect(vi.mocked(trackStudySessionEnded).mock.calls[0]?.[0]).toMatchObject({
      measureMode: "timer",
      display: { faceMask: false },
    });
  });

  it("타이머로 측정하던 세션을 이어받으면 기기 설정이 카메라여도 카메라를 열지 않는다", async () => {
    const getUserMedia = stubWorkingCamera();
    restore.restored = { ...RESTORED_BASE, source: "TIMER" };

    renderRoom();

    expect(cameraPrompt()).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("카메라로 측정하던 세션을 이어받으면 기기 설정이 타이머여도 카메라·AI 감지·움직임 센서·타임랩스가 돈다", async () => {
    const getUserMedia = stubWorkingCamera();
    writeMeasureMode("timer");
    restore.restored = { ...RESTORED_BASE, source: "MEASURED" };

    renderRoom();

    expect(cameraPrompt()).toBeInTheDocument();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    expect(vision.detector.start).toHaveBeenCalled();
    expect(motionSensorMessages()).not.toEqual([]);
    expect(recorder.begin).toHaveBeenCalled();
  });
});

describe("RoomPage 하단 안심 문구", () => {
  const CAPTION = "카메라 화면은 어디로도 보내지 않아요";
  const UNREGISTERED = "이 기기가 아직 등록되지 않아 기록이 저장되지 않습니다";

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
  });

  it.each(["camera", "simple"] as const)(
    "카메라 세션은 확인 창에 %s로 답한 뒤에도 하단에 안심 문구를 보인다",
    (choice) => {
      stubWorkingCamera();
      writeMeasureMode("camera");
      renderRoom();

      answerCameraPrompt(choice);

      expect(cameraPrompt()).not.toBeInTheDocument();
      expect(screen.getByText(CAPTION)).toBeInTheDocument();
    },
  );

  it("안심 문구는 일시정지 버튼과 종료 버튼 사이에 두고 초점을 받지 않는다", () => {
    stubWorkingCamera();
    writeMeasureMode("camera");
    renderRoom();

    answerCameraPrompt();

    const caption = screen.getByText(CAPTION);
    const pause = screen.getByRole("button", { name: "일시정지" });
    const exit = screen.getByRole("button", { name: "공부 종료" });
    expect(pause.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(caption.compareDocumentPosition(exit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(caption).not.toHaveAttribute("tabindex");
  });

  it("카메라 없는 세션에는 안심 문구가 없다", () => {
    writeMeasureMode("timer");
    renderRoom();

    expect(screen.queryByText(CAPTION)).not.toBeInTheDocument();
  });

  it("비회원 안내가 뜨는 동안에는 비회원 안내만 보인다", () => {
    stubWorkingCamera();
    writeMeasureMode("camera");
    renderRoom("/room/7");

    answerCameraPrompt();

    expect(screen.getByText(UNREGISTERED)).toBeInTheDocument();
    expect(screen.queryByText(CAPTION)).not.toBeInTheDocument();
  });
});
