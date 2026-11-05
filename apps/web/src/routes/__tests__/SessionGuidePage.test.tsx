import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { markSessionGuideSeen, sessionGuideState } from "@/features/study-session/sessionGuide";
import type * as Amplitude from "@/lib/amplitude";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { requestSessionStart } from "@/lib/sessionStart";
import { SessionGuidePage } from "@/routes/SessionGuidePage";

vi.mock("@/lib/sessionStart", () => ({ requestSessionStart: vi.fn() }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));

const capability = vi.hoisted(() => ({ tabFocus: true }));
vi.mock("@/lib/rankingCapability", () => ({
  hasRankingTab: () => capability.tabFocus,
}));

const analytics = vi.hoisted(() => ({
  trackFocusStartTapped: vi.fn(),
  trackStudySessionHelpShown: vi.fn(),
  trackStudySessionHelpStepViewed: vi.fn(),
  trackStudySessionHelpCompleted: vi.fn(),
  trackStudySessionHelpDismissed: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  ...analytics,
}));

function Probe({ testId }: { testId: string }) {
  const location = useLocation();
  return <div data-testid={testId}>{location.pathname + location.search}</div>;
}

/** 랭킹에서 집중 시작을 눌러 가이드로 온 상태 */
function renderFromRanking() {
  render(
    <MemoryRouter
      initialEntries={[
        "/ranking?userId=7",
        { pathname: "/session-guide", search: "?userId=7", state: { source: "ranking_card" } },
      ]}
      initialIndex={1}
    >
      <Routes>
        <Route path="/session-guide" element={<SessionGuidePage />} />
        <Route path="/ranking" element={<Probe testId="ranking" />} />
        <Route path="/home" element={<Probe testId="home" />} />
        <Route path="/room/1" element={<Probe testId="room" />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function goToLastStep() {
  for (let index = 0; index < 4; index += 1) {
    await userEvent.click(screen.getByRole("button", { name: "다음" }));
  }
}

/** 앱이 탭 위에 세션 화면이나 거부 안내를 덮었다는 신호를 흉내낸다. */
function coverTab() {
  sendNative({ type: "tab-focus", focused: false, atMs: Date.now() });
}

function sendNative(message: Record<string, unknown>) {
  const entry = (globalThis as unknown as Record<string, (raw: string) => void>)[
    NATIVE_MESSAGE_ENTRY
  ];
  act(() => {
    entry(JSON.stringify(message));
  });
}

const startButton = () => screen.getByRole("button", { name: "순공 시작하기" });
const laterButton = () => screen.getByRole("button", { name: "나중에 시작할게요" });

afterEach(() => {
  capability.tabFocus = true;
  localStorage.clear();
  vi.clearAllMocks();
});

describe("SessionGuidePage", () => {
  it("뜨면 노출 이벤트만 보내고 세션은 시작하지 않는다", () => {
    renderFromRanking();

    expect(screen.getByRole("dialog", { name: "세션 도움말" })).toBeInTheDocument();
    expect(analytics.trackStudySessionHelpShown).toHaveBeenCalledExactlyOnceWith("auto", "single");
    expect(analytics.trackStudySessionHelpStepViewed).toHaveBeenCalledExactlyOnceWith({
      step: 1,
      stepId: "away",
      trigger: "auto",
      roomType: "single",
    });
    expect(requestSessionStart).not.toHaveBeenCalled();
    expect(analytics.trackFocusStartTapped).not.toHaveBeenCalled();
  });

  it("순공 시작하기는 완료를 남기고 누른 자리와 함께 세션 시작을 요청한다", async () => {
    vi.mocked(requestSessionStart).mockResolvedValue("native");
    renderFromRanking();
    await goToLastStep();

    await userEvent.click(startButton());

    expect(sessionGuideState(7)).toBe("seen");
    expect(analytics.trackStudySessionHelpCompleted).toHaveBeenCalledExactlyOnceWith(
      "auto",
      "single",
      "start",
    );
    expect(analytics.trackFocusStartTapped).toHaveBeenCalledExactlyOnceWith("ranking_card");
    expect(requestSessionStart).toHaveBeenCalledExactlyOnceWith(7, expect.any(Function));
  });

  it("앱에서는 세션이나 거부 안내가 덮기 전까지 가이드를 유지하고, 덮으면 이전 화면으로 돌아간다", async () => {
    vi.mocked(requestSessionStart).mockResolvedValue("native");
    renderFromRanking();
    await goToLastStep();

    await userEvent.click(startButton());
    await act(async () => {});

    expect(screen.getByRole("dialog", { name: "세션 도움말" })).toBeInTheDocument();
    expect(screen.queryByTestId("ranking")).not.toBeInTheDocument();

    coverTab();

    expect(await screen.findByTestId("ranking")).toHaveTextContent("/ranking?userId=7");
  });

  it("권한 창에 오래 답하지 않아도 덮기 전까지 가이드를 닫지 않는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(requestSessionStart).mockResolvedValue("native");
      renderFromRanking();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      for (let index = 0; index < 4; index += 1) {
        await user.click(screen.getByRole("button", { name: "다음" }));
      }
      await user.click(startButton());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5 * 60_000);
      });

      expect(screen.queryByTestId("ranking")).not.toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: "세션 도움말" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("tab-focus가 없는 구버전 앱은 권한 결과가 올 때까지 가이드를 유지하고, 결과가 오면 이전 화면으로 돌아간다", async () => {
    capability.tabFocus = false;
    vi.mocked(requestSessionStart).mockResolvedValue("native");
    renderFromRanking();
    await goToLastStep();

    await userEvent.click(startButton());
    await act(async () => {});

    expect(screen.getByRole("dialog", { name: "세션 도움말" })).toBeInTheDocument();
    expect(screen.queryByTestId("ranking")).not.toBeInTheDocument();

    sendNative({
      type: "track-event",
      name: "focus_other_event",
      atMs: Date.now(),
    });
    expect(screen.queryByTestId("ranking")).not.toBeInTheDocument();

    sendNative({
      type: "track-event",
      name: "camera_permission_gate_resolved",
      properties: { result: "denied", prompted: true, room_type: "single" },
      atMs: Date.now(),
    });

    expect(await screen.findByTestId("ranking")).toHaveTextContent("/ranking?userId=7");
  });

  it("최신 앱은 권한 결과만으로 닫지 않고 화면이 덮여야 돌아간다", async () => {
    vi.mocked(requestSessionStart).mockResolvedValue("native");
    renderFromRanking();
    await goToLastStep();
    await userEvent.click(startButton());
    await act(async () => {});

    sendNative({
      type: "track-event",
      name: "camera_permission_gate_resolved",
      properties: { result: "granted", prompted: true, room_type: "single" },
      atMs: Date.now(),
    });

    expect(screen.queryByTestId("ranking")).not.toBeInTheDocument();
  });

  it("권한 결과를 받은 뒤 화면을 떠나면 구독을 풀어 다시 반응하지 않는다", async () => {
    capability.tabFocus = false;
    vi.mocked(requestSessionStart).mockResolvedValue("native");
    renderFromRanking();
    await goToLastStep();
    await userEvent.click(startButton());
    await act(async () => {});
    sendNative({
      type: "track-event",
      name: "camera_permission_gate_resolved",
      properties: { result: "granted", prompted: false, room_type: "single" },
      atMs: Date.now(),
    });
    await screen.findByTestId("ranking");

    expect(() => coverTab()).not.toThrow();
    expect(screen.getByTestId("ranking")).toBeInTheDocument();
  });

  it("세션 시작을 기다리는 동안에는 나중에 시작할게요가 듣지 않는다", async () => {
    vi.mocked(requestSessionStart).mockResolvedValue("native");
    renderFromRanking();
    await goToLastStep();

    await userEvent.click(startButton());
    await userEvent.click(laterButton());

    expect(analytics.trackStudySessionHelpCompleted).toHaveBeenCalledExactlyOnceWith(
      "auto",
      "single",
      "start",
    );
    expect(screen.queryByTestId("ranking")).not.toBeInTheDocument();
  });

  it("브라우저에서는 쿼리를 지킨 채 세션 화면으로 바꿔 간다", async () => {
    vi.mocked(requestSessionStart).mockImplementation(async (_userId, navigateToRoom) => {
      navigateToRoom();
      return "web";
    });
    renderFromRanking();
    await goToLastStep();

    await userEvent.click(startButton());

    expect(await screen.findByTestId("room")).toHaveTextContent("/room/1?userId=7");
  });

  it("처리 중에 다시 눌러도 세션 시작은 한 번만 요청한다", async () => {
    vi.mocked(requestSessionStart).mockReturnValue(new Promise(() => {}));
    renderFromRanking();
    await goToLastStep();

    await userEvent.click(startButton());
    await userEvent.click(startButton());

    expect(requestSessionStart).toHaveBeenCalledTimes(1);
    expect(analytics.trackStudySessionHelpCompleted).toHaveBeenCalledTimes(1);
  });

  it("세션 시작이 실패하면 다시 누를 수 있다", async () => {
    vi.mocked(requestSessionStart).mockRejectedValueOnce(new Error("network"));
    vi.mocked(requestSessionStart).mockReturnValueOnce(new Promise(() => {}));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    renderFromRanking();
    await goToLastStep();

    await userEvent.click(startButton());
    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    await userEvent.click(startButton());

    expect(requestSessionStart).toHaveBeenCalledTimes(2);
    expect(analytics.trackStudySessionHelpCompleted).toHaveBeenCalledTimes(1);
  });

  it("나중에 시작할게요는 세션 없이 이전 화면으로 가고 완료로 남긴다", async () => {
    renderFromRanking();
    await goToLastStep();

    await userEvent.click(laterButton());

    expect(await screen.findByTestId("ranking")).toBeInTheDocument();
    expect(sessionGuideState(7)).toBe("seen");
    expect(analytics.trackStudySessionHelpCompleted).toHaveBeenCalledExactlyOnceWith(
      "auto",
      "single",
      "later",
    );
    expect(requestSessionStart).not.toHaveBeenCalled();
    expect(analytics.trackFocusStartTapped).not.toHaveBeenCalled();
  });

  it("Escape는 기록 없이 이전 화면으로 돌아가 다음에 다시 뜬다", async () => {
    renderFromRanking();
    await userEvent.click(screen.getByRole("button", { name: "다음" }));

    fireEvent.keyDown(screen.getByRole("dialog", { name: "세션 도움말" }), { key: "Escape" });

    expect(await screen.findByTestId("ranking")).toBeInTheDocument();
    expect(sessionGuideState(7)).toBeNull();
    expect(analytics.trackStudySessionHelpDismissed).toHaveBeenCalledExactlyOnceWith({
      step: 2,
      stepId: "measuring",
      trigger: "auto",
      roomType: "single",
      reason: "escape",
    });
    expect(requestSessionStart).not.toHaveBeenCalled();
  });

  it("이미 본 계정이 직접 열면 쿼리를 지킨 채 홈으로 바꿔 간다", async () => {
    markSessionGuideSeen(7);
    render(
      <MemoryRouter initialEntries={["/session-guide?userId=7"]}>
        <Routes>
          <Route path="/session-guide" element={<SessionGuidePage />} />
          <Route path="/home" element={<Probe testId="home" />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("home")).toHaveTextContent("/home?userId=7");
    expect(analytics.trackStudySessionHelpShown).not.toHaveBeenCalled();
  });

  it("직접 열어 돌아갈 화면이 없으면 나중에 시작할게요가 홈으로 간다", async () => {
    render(
      <MemoryRouter initialEntries={["/session-guide?userId=7"]}>
        <Routes>
          <Route path="/session-guide" element={<SessionGuidePage />} />
          <Route path="/home" element={<Probe testId="home" />} />
        </Routes>
      </MemoryRouter>,
    );
    await goToLastStep();

    await userEvent.click(laterButton());

    expect(await screen.findByTestId("home")).toHaveTextContent("/home?userId=7");
  });
});
