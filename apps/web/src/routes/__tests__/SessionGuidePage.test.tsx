import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { markSessionGuideSeen, sessionGuideState } from "@/features/study-session/sessionGuide";
import type * as Amplitude from "@/lib/amplitude";
import { FOCUS_START_SOURCES } from "@/lib/amplitude";
import type * as tokenSourceModule from "@/lib/auth/tokenSource";
import type { AuthSnapshot, TokenSource } from "@/lib/auth/tokenSource";
import type * as SessionStart from "@/lib/sessionStart";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { requestSessionStart } from "@/lib/sessionStart";
import { SessionGuidePage } from "@/routes/SessionGuidePage";

vi.mock("@/lib/sessionStart", async (original) => ({
  ...(await original<typeof SessionStart>()),
  requestSessionStart: vi.fn(),
}));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));

const identity = vi.hoisted(() => ({ source: null as TokenSource | null }));
vi.mock("@/lib/auth/tokenSource", async (importOriginal) => ({
  ...(await importOriginal<typeof tokenSourceModule>()),
  getTokenSource: () => identity.source,
}));

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

function renderFromPlanner(initialSubjectId: unknown) {
  render(
    <MemoryRouter
      initialEntries={[
        "/planner?userId=7&lang=ko",
        {
          pathname: "/session-guide",
          search: "?userId=7&lang=ko&date=2026-11-05&from=week&initialSubjectId=99",
          state: { source: "planner", initialSubjectId },
        },
      ]}
      initialIndex={1}
    >
      <Routes>
        <Route path="/planner" element={<Probe testId="planner" />} />
        <Route path="/session-guide" element={<SessionGuidePage />} />
        <Route path="/home" element={<Probe testId="home" />} />
        <Route path="/room/1" element={<Probe testId="room" />} />
      </Routes>
      <Toaster />
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
  identity.source = null;
  capability.tabFocus = true;
  localStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
  act(() => toast.dismiss());
});

describe("SessionGuidePage", () => {
  it("플래너 과목은 마지막 시작 뒤 네이티브에 전달하고 URL 과목은 무시한다", async () => {
    const actual = await vi.importActual<typeof SessionStart>("@/lib/sessionStart");
    vi.mocked(requestSessionStart).mockImplementation(actual.requestSessionStart);
    window.history.replaceState({}, "", "/?subjectStart=1");
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    renderFromPlanner(3);

    expect(screen.getByRole("dialog", { name: "세션 도움말" })).toBeInTheDocument();
    expect(postMessage).not.toHaveBeenCalled();
    await goToLastStep();
    await userEvent.click(startButton());

    await waitFor(() => expect(postMessage).toHaveBeenCalled());
    expect(postMessage.mock.calls.map(([raw]) => JSON.parse(String(raw)))).toContainEqual({
      type: "start-session",
      initialSubjectId: 3,
      atMs: expect.any(Number),
    });
    expect(screen.queryByTestId("room")).not.toBeInTheDocument();
    coverTab();
    expect(await screen.findByTestId("planner")).toBeInTheDocument();
    expect(analytics.trackFocusStartTapped).toHaveBeenCalledExactlyOnceWith("planner");
  });

  it.each([undefined, "3", 0, -1, Number.MAX_SAFE_INTEGER + 1])(
    "유효하지 않은 플래너 과목 %s와 URL 과목으로는 초기 과목을 선택하지 않는다",
    async (initialSubjectId) => {
      vi.mocked(requestSessionStart).mockImplementation(async (_user, navigateToRoom) => {
        navigateToRoom();
        return "web";
      });
      renderFromPlanner(initialSubjectId);
      await goToLastStep();
      await userEvent.click(startButton());

      expect(await screen.findByTestId("room")).toHaveTextContent("/room/1?userId=7&lang=ko");
      expect(screen.getByTestId("room")).not.toHaveTextContent("initialSubjectId");
      expect(requestSessionStart).toHaveBeenCalledExactlyOnceWith(7, expect.any(Function));
    },
  );

  it("과목 시작을 지원하지 않는 앱은 업데이트 안내를 띄우고 플래너로 돌아간다", async () => {
    const actual = await vi.importActual<typeof SessionStart>("@/lib/sessionStart");
    vi.mocked(requestSessionStart).mockImplementation(actual.requestSessionStart);
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    renderFromPlanner(3);
    await goToLastStep();
    await userEvent.click(startButton());

    expect(await screen.findByTestId("planner")).toBeInTheDocument();
    expect(
      await screen.findByText("이 과목으로 시작하려면 앱을 업데이트해 주세요"),
    ).toBeInTheDocument();
    expect(postMessage.mock.calls.map(([raw]) => JSON.parse(String(raw)).type)).not.toContain(
      "start-session",
    );
  });

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
    expect(analytics.trackFocusStartTapped).toHaveBeenCalledTimes(1);
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

  it("시작 요청을 보내는 동안에는 나중에 시작할게요와 Escape가 듣지 않는다", async () => {
    vi.mocked(requestSessionStart).mockReturnValue(new Promise(() => {}));
    renderFromRanking();
    await goToLastStep();

    await userEvent.click(startButton());
    await userEvent.click(laterButton());
    fireEvent.keyDown(screen.getByRole("dialog", { name: "세션 도움말" }), { key: "Escape" });

    expect(screen.queryByTestId("ranking")).not.toBeInTheDocument();
    expect(analytics.trackStudySessionHelpDismissed).not.toHaveBeenCalled();
  });

  it("시작 요청이 끝났는데 신호가 오지 않으면 나중에 시작할게요로 나갈 수 있고 완료는 한 번만 남는다", async () => {
    vi.mocked(requestSessionStart).mockResolvedValue("native");
    renderFromRanking();
    await goToLastStep();
    await userEvent.click(startButton());
    await act(async () => {});

    await userEvent.click(laterButton());

    expect(await screen.findByTestId("ranking")).toBeInTheDocument();
    expect(analytics.trackStudySessionHelpCompleted).toHaveBeenCalledExactlyOnceWith(
      "auto",
      "single",
      "start",
    );
  });

  it("시작 요청이 끝났는데 신호가 오지 않으면 Escape로 나갈 수 있다", async () => {
    vi.mocked(requestSessionStart).mockResolvedValue("native");
    renderFromRanking();
    await goToLastStep();
    await userEvent.click(startButton());
    await act(async () => {});

    fireEvent.keyDown(screen.getByRole("dialog", { name: "세션 도움말" }), { key: "Escape" });

    expect(await screen.findByTestId("ranking")).toBeInTheDocument();
    expect(analytics.trackStudySessionHelpDismissed).not.toHaveBeenCalled();
  });

  it("시작 요청이 끝난 뒤 순공 시작하기를 다시 눌러도 세션 시작을 또 요청하지 않는다", async () => {
    vi.mocked(requestSessionStart).mockResolvedValue("native");
    renderFromRanking();
    await goToLastStep();
    await userEvent.click(startButton());
    await act(async () => {});

    await userEvent.click(startButton());

    expect(requestSessionStart).toHaveBeenCalledTimes(1);
  });

  it("집중 시작으로 오지 않고 직접 열면 가이드 없이 쿼리를 지킨 채 홈으로 바꿔 간다", async () => {
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

  it.each(FOCUS_START_SOURCES)("누른 자리 %s로 오면 가이드를 띄운다", (source) => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/session-guide", search: "?userId=7", state: { source } }]}
      >
        <Routes>
          <Route path="/session-guide" element={<SessionGuidePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("dialog", { name: "세션 도움말" })).toBeInTheDocument();
  });

  it("누른 자리가 알 수 없는 값이면 가이드 없이 홈으로 바꿔 간다", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: "/session-guide", search: "?userId=7", state: { source: "unknown" } },
        ]}
      >
        <Routes>
          <Route path="/session-guide" element={<SessionGuidePage />} />
          <Route path="/home" element={<Probe testId="home" />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("home")).toBeInTheDocument();
  });

  it("신원이 늦게 와도 홈으로 튕기지 않고 도착한 뒤 가이드를 띄운다", async () => {
    let snapshot: AuthSnapshot | null = null;
    const listeners = new Set<(next: AuthSnapshot) => void>();
    identity.source = {
      getAccessToken: vi.fn(),
      getCurrentToken: vi.fn(),
      refresh: vi.fn(),
      getUserId: () => snapshot?.userId ?? null,
      hasSettled: () => snapshot !== null,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/session-guide", search: "", state: { source: "home" } }]}
      >
        <Routes>
          <Route path="/session-guide" element={<SessionGuidePage />} />
          <Route path="/home" element={<Probe testId="home" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("home")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "세션 도움말" })).not.toBeInTheDocument();

    act(() => {
      snapshot = { userId: 7, accessToken: "t" };
      for (const listener of listeners) listener(snapshot);
    });

    expect(await screen.findByRole("dialog", { name: "세션 도움말" })).toBeInTheDocument();
    expect(screen.queryByTestId("home")).not.toBeInTheDocument();
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
});
