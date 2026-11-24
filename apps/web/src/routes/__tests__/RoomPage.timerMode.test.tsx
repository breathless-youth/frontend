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
import type { SessionBannerGroup } from "@/features/session-banner/sessionBanner";
import { AWAY_LIMIT_MS } from "@/features/study-session/sessionTuning";
import { submitStudySession } from "@/features/study-session/submitStudySession";
import { assignPremiumPrice } from "@/features/premium-fake-door/premiumFakeDoor";
import {
  trackPremiumFakeDoor,
  trackSessionBannerClicked,
  trackSessionSimpleModeToggled,
  trackStudySessionEnded,
  trackStudySessionPaused,
} from "@/lib/amplitude";
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

// 실험군 판정은 훅 테스트가 따로 보고 여기서는 군에 따른 화면만 본다.
const banner = vi.hoisted(() => ({ group: null as SessionBannerGroup | null }));
vi.mock("@/features/session-banner/useSessionBannerGroup", () => ({
  useSessionBannerGroup: () => banner.group,
}));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  trackStudySessionEnded: vi.fn(),
  trackSessionSimpleModeToggled: vi.fn(),
  trackStudySessionPaused: vi.fn(),
  trackPremiumFakeDoor: vi.fn(),
  trackSessionBannerClicked: vi.fn(),
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

  it("앱 거부 화면에서 카메라 없이 열면 기기 설정이 카메라여도 카메라를 열지 않고 기기 설정을 타이머로 바꾼다", async () => {
    const getUserMedia = stubWorkingCamera();
    writeMeasureMode("camera");

    renderRoom("/room/7?userId=1&measureMode=timer");

    expect(cameraPrompt()).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(readMeasureMode()).toBe("timer");
  });

  it("카메라로 측정하던 세션을 이어받으면 주소에 timer가 있어도 카메라를 열고 기기 설정을 바꾸지 않는다", async () => {
    const getUserMedia = stubWorkingCamera();
    restore.restored = { ...RESTORED_BASE, source: "MEASURED" };

    renderRoom("/room/7?userId=1&measureMode=timer");

    expect(cameraPrompt()).toBeInTheDocument();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    expect(readMeasureMode()).toBe("camera");
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
    banner.group = null;
  });

  it.each(["camera", "simple"] as const)(
    "카메라 세션은 확인 창에 %s로 답한 뒤에도 가로 화면과 태블릿에 안심 문구를 보인다",
    (choice) => {
      stubWorkingCamera();
      writeMeasureMode("camera");
      renderRoom();

      answerCameraPrompt(choice);

      expect(cameraPrompt()).not.toBeInTheDocument();
      expect(screen.getByText(CAPTION)).toHaveClass("regular:block", "landscape-compact:block");
    },
  );

  it("로그인 사용자의 세로 폰 버튼 줄에는 안심 문구를 보이지 않는다", () => {
    stubWorkingCamera();
    writeMeasureMode("camera");
    renderRoom();

    answerCameraPrompt();

    // jsdom은 반응형 변형을 적용하지 않아 세로 폰 기본값인 hidden 클래스로 본다.
    expect(screen.getByText(CAPTION)).toHaveClass("hidden");
  });

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

describe("RoomPage 세션 한 줄 배너", () => {
  const BANNER_NAME = /^AD /;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-11-25T12:00:00+09:00") });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ version: 1, sounds: [] }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    banner.group = null;
  });

  it("배너를 보는 군은 일시정지 버튼과 종료 버튼 사이에 배너가 있다", () => {
    banner.group = "exposed";
    stubWorkingCamera();
    writeMeasureMode("camera");
    renderRoom();

    answerCameraPrompt();

    const line = screen.getByRole("button", { name: BANNER_NAME });
    const pause = screen.getByRole("button", { name: "일시정지" });
    const exit = screen.getByRole("button", { name: "공부 종료" });
    expect(line).toHaveTextContent("AI가 오늘 할 일을 짜 드려요");
    expect(pause.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.compareDocumentPosition(exit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("배너를 보는 군은 안전 영역 크기와 관계없이 버튼 줄 아래에 배너 자리를 둔다", () => {
    banner.group = "exposed";
    stubWorkingCamera();
    writeMeasureMode("camera");
    renderRoom();

    answerCameraPrompt();

    const row = screen.getByRole("button", { name: "일시정지" }).parentElement?.parentElement;
    expect(row).toHaveClass("mb-5");
    expect(row?.className).not.toContain("safe-area-inset-bottom");
  });

  it("더보기 메뉴가 열린 채 배너 자리를 누르면 메뉴만 닫히고 혜택 화면은 열리지 않는다", async () => {
    banner.group = "exposed";
    stubWorkingCamera();
    writeMeasureMode("camera");
    renderRoom();
    answerCameraPrompt();
    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    expect(screen.getAllByRole("menuitem").length).toBeGreaterThan(0);

    // 실제 기기에서는 누름 시작이 메뉴를 닫고, 이어지는 클릭이 잠금이 풀린 배너에 닿는다.
    const line = screen.getByRole("button", { name: BANNER_NAME, hidden: true });
    fireEvent.pointerDown(document.body);
    fireEvent.click(line);

    expect(screen.queryByRole("dialog", { name: "스파르타 기능" })).not.toBeInTheDocument();
    expect(vi.mocked(trackSessionBannerClicked)).not.toHaveBeenCalled();

    // 메뉴가 닫힌 뒤의 다음 누름은 그대로 연다.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.pointerDown(line);
    fireEvent.click(line);
    expect(await screen.findByRole("dialog", { name: "스파르타 기능" })).toBeInTheDocument();
  });

  it("배너를 보지 않는 군에는 배너가 없다", () => {
    banner.group = "control";
    stubWorkingCamera();
    writeMeasureMode("camera");
    renderRoom();

    answerCameraPrompt();

    expect(screen.getByRole("button", { name: "일시정지" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: BANNER_NAME })).not.toBeInTheDocument();
  });

  it("배너를 누르면 타이머를 멈추지 않고 세션 자리 값으로 혜택 화면을 연다", async () => {
    banner.group = "exposed";
    // 혜택 화면의 불꽃 캔버스가 그리기 판을 찾는다. jsdom에는 없어서 없는 것으로 둔다.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    stubWorkingCamera();
    writeMeasureMode("camera");
    renderRoom();
    answerCameraPrompt();

    await userEvent.click(screen.getByRole("button", { name: BANNER_NAME }));

    expect(screen.getByRole("dialog", { name: "스파르타 기능" })).toBeInTheDocument();
    expect(vi.mocked(trackPremiumFakeDoor)).toHaveBeenCalledWith("opened", {
      price: assignPremiumPrice(1),
      placement: "SESSION",
    });
    expect(vi.mocked(trackStudySessionPaused)).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "일시정지" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 시작" })).not.toBeInTheDocument();
  });

  it("혜택 화면을 닫으면 세션 화면으로 돌아오고 배너가 다시 보인다", async () => {
    banner.group = "exposed";
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    stubWorkingCamera();
    writeMeasureMode("camera");
    renderRoom();
    answerCameraPrompt();

    await userEvent.click(screen.getByRole("button", { name: BANNER_NAME }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "스파르타 기능" })).getByRole("button", {
        name: "뒤로 가기",
      }),
    );

    expect(screen.queryByRole("dialog", { name: "스파르타 기능" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: BANNER_NAME })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "일시정지" })).toBeInTheDocument();
  });

  it("혜택 화면에서 신청을 마치고 공부로 돌아오면 배너가 내려간다", async () => {
    banner.group = "exposed";
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    stubWorkingCamera();
    writeMeasureMode("camera");
    renderRoom();
    answerCameraPrompt();

    await userEvent.click(screen.getByRole("button", { name: BANNER_NAME }));
    await userEvent.click(screen.getByRole("button", { name: "사전 신청하기" }));
    // 리디자인 뒤 신청은 이메일 화면 하나다(만 14세 확인 단계 없음, BY-1393).
    await userEvent.type(screen.getByLabelText("이메일"), "minjun@example.com");
    await userEvent.click(screen.getByRole("checkbox", { name: "[필수] 만 14세 이상이에요" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "[필수] 개인정보 수집·이용 동의" }));
    await userEvent.click(screen.getByRole("button", { name: "사전 신청하기" }));
    await userEvent.click(await screen.findByRole("button", { name: "공부로 돌아가기" }));

    expect(screen.queryByRole("dialog", { name: "신청 완료" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "일시정지" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: BANNER_NAME })).not.toBeInTheDocument();
  });

  it("사전 신청을 마친 기록이 있으면 배너가 없다", () => {
    banner.group = "exposed";
    localStorage.setItem(
      "focusmakers.premiumFakeDoor.v1.1",
      JSON.stringify({ dismissed: false, applied: true, viewedSent: true }),
    );
    stubWorkingCamera();
    writeMeasureMode("camera");
    renderRoom();
    answerCameraPrompt();

    expect(screen.getByRole("button", { name: "일시정지" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: BANNER_NAME })).not.toBeInTheDocument();
  });
});
