import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setSessionCountdownSecondsForTest } from "@/features/study-session/sessionCountdown";
import { sessionGuideState } from "@/features/study-session/sessionGuide";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { resetGlassChrome } from "@/test/nativeControlStub";
import { RoomPage } from "../RoomPage";

/**
 * 앱이 카메라 권한을 묻지 않고 연 세션(`cameraPermission=later`)의 RoomPage 연결만 본다.
 * 가이드가 닫힐 때 권한을 묻고, 답을 받기 전에는 카메라를 켜지 않고 카운트다운도 세지 않는다.
 * 앱이 거부 화면으로 바꾸는 일은 앱 테스트(`nativeBridgeHandler.test.ts`)가 본다.
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

const amplitude = vi.hoisted(() => ({ trackStudySessionStarted: vi.fn() }));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...amplitude,
}));

const postMessage = vi.fn();
const getUserMedia = vi.fn(
  async () => ({ getTracks: () => [], getVideoTracks: () => [] }) as unknown as MediaStream,
);

function renderRoom(query: string) {
  return render(
    <MemoryRouter initialEntries={[`/room/7?userId=1&detector=mock${query}`]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const sentGates = () =>
  postMessage.mock.calls
    .map(([raw]) => JSON.parse(raw as string) as { type: string })
    .filter((message) => message.type === "request-camera-gate");

function answerGate(granted: boolean) {
  const entry = (globalThis as unknown as Record<string, (raw: string) => void>)[
    NATIVE_MESSAGE_ENTRY
  ];
  act(() => {
    entry(JSON.stringify({ type: "camera-gate-result", granted, atMs: Date.now() }));
  });
}

function startFromLastStep() {
  for (let index = 0; index < 5; index += 1) {
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
  }
  fireEvent.click(screen.getByRole("button", { name: "공부 시작하기" }));
}

const helpDialog = () => screen.queryByRole("dialog", { name: "세션 도움말" });
const countdown = () => screen.queryByTestId("camera-countdown");

describe("RoomPage 가이드 끝 카메라 권한", () => {
  beforeEach(() => {
    setSessionCountdownSecondsForTest(3);
    vi.useFakeTimers();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    // 이 표시를 싣는 앱은 게이트도 처리한다(`cameraGate=1`). 없으면 구버전 앱으로 보고 3초 뒤 통과시킨다.
    window.history.replaceState(null, "", "/?cameraGate=1");
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: {
        getUserMedia,
        enumerateDevices: vi.fn(async () => [{ kind: "videoinput" }]),
      },
    });
  });

  afterEach(() => {
    // 답하지 않은 요청은 모듈에 남아 다음 테스트가 물려받으므로 닫는다.
    answerGate(false);
    window.history.replaceState(null, "", "/");
    vi.useRealTimers();
    cleanup();
    resetGlassChrome();
    vi.unstubAllGlobals();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("가이드가 떠 있는 동안 카메라를 켜지 않고 권한도 묻지 않는다", async () => {
    renderRoom("&cameraPermission=later");
    await advance(5000);

    expect(helpDialog()).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(sentGates()).toEqual([]);
  });

  it("공부 시작하기를 누르면 권한을 묻고, 허용 답을 받은 뒤에야 카메라를 켜고 3초를 센다", async () => {
    renderRoom("&cameraPermission=later&initialSubjectId=3");
    await advance(0);

    startFromLastStep();
    await advance(5000);

    expect(helpDialog()).not.toBeInTheDocument();
    expect(sessionGuideState(1)).toBe("seen");
    expect(sentGates()).toEqual([
      expect.objectContaining({ type: "request-camera-gate", roomType: "single" }),
    ]);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(countdown()).not.toBeInTheDocument();
    expect(amplitude.trackStudySessionStarted).not.toHaveBeenCalled();

    answerGate(true);
    await advance(0);

    expect(getUserMedia).toHaveBeenCalled();
    expect(countdown()).toHaveTextContent("3");
    await advance(3000);
    expect(amplitude.trackStudySessionStarted).toHaveBeenCalledOnce();
  });

  it("거부 답이면 카메라를 켜지 않고 세지도 않는다(앱이 화면을 바꾼다)", async () => {
    renderRoom("&cameraPermission=later");
    await advance(0);

    startFromLastStep();
    answerGate(false);
    await advance(10_000);

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(countdown()).not.toBeInTheDocument();
    expect(amplitude.trackStudySessionStarted).not.toHaveBeenCalled();
  });

  it("Escape로 닫아도 그때 권한을 묻는다", async () => {
    renderRoom("&cameraPermission=later");
    await advance(0);

    fireEvent.keyDown(screen.getByRole("dialog", { name: "세션 도움말" }), { key: "Escape" });
    await advance(0);

    expect(sentGates()).toHaveLength(1);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("가이드를 이미 본 계정으로 열렸으면 가이드 없이 바로 권한을 묻는다", async () => {
    localStorage.setItem("focusmakers:session-guide:1", "seen");
    renderRoom("&cameraPermission=later");
    await advance(0);

    expect(helpDialog()).not.toBeInTheDocument();
    expect(sentGates()).toHaveLength(1);
    expect(countdown()).not.toBeInTheDocument();
  });

  it("표시 없이 연 세션은 지금처럼 가이드 중에도 카메라를 켜고 권한을 다시 묻지 않는다", async () => {
    renderRoom("");
    await advance(0);

    expect(helpDialog()).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalled();

    startFromLastStep();
    await advance(0);
    expect(sentGates()).toEqual([]);
    expect(countdown()).toHaveTextContent("3");
  });
});
