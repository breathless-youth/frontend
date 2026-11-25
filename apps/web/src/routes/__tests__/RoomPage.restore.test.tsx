import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as FocusDetectorModule from "@/features/study-session/adapters/focusDetector";
import { setSessionCountdownSecondsForTest } from "@/features/study-session/sessionCountdown";
import { AWAY_LIMIT_MS } from "@/features/study-session/sessionTuning";
import type * as BridgeModule from "@/lib/bridge";
import { __resetLaunchReadyForTests } from "@/lib/launchReady";

import { RoomPage } from "../RoomPage";

const useActiveSessionRestore = vi.hoisted(() => vi.fn());
const useStudyRoomSession = vi.hoisted(() => vi.fn());
const listSubjects = vi.hoisted(() => vi.fn());
const visionCloses = vi.hoisted((): { close: () => void }[] => []);

vi.mock("@/features/study-session/useActiveSessionRestore", () => ({ useActiveSessionRestore }));
// useSubjects는 실제 훅이라 복원 세션이면 목록을 받는다 — jsdom엔 fetch가 없어 API 계층만 막는다.
vi.mock("@/lib/subjectApi", () => ({
  listSubjects,
  createSubject: vi.fn(),
  renameSubject: vi.fn(),
  deleteSubject: vi.fn(),
  reorderSubjects: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));
vi.mock("@/features/study-session/useStudyRoomSession", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useStudyRoomSession };
});

// 감지 모델 해제를 확인하려고 실제 감지기의 `close`만 감싼다.
vi.mock("@/features/study-session/adapters/focusDetector", async (importOriginal) => {
  const actual = await importOriginal<typeof FocusDetectorModule>();
  return {
    ...actual,
    createVisionFocusDetector: (
      options: Parameters<typeof actual.createVisionFocusDetector>[0],
    ) => {
      const detector = actual.createVisionFocusDetector(options);
      visionCloses.push(vi.spyOn(detector, "close") as unknown as { close: () => void });
      return detector;
    },
  };
});

const RESTORED = {
  startedAtMs: Date.UTC(2026, 7, 28, 1, 0, 0),
  reportedAtMs: Date.UTC(2026, 7, 28, 1, 32, 0),
  baseStudySec: 1850,
  baseFocusSec: 1620,
  events: [],
};

function stubSession() {
  useStudyRoomSession.mockReturnValue({
    focusSec: 0,
    studySec: 0,
    sessionState: { kind: "FOCUS" },
    phase: { name: "studying" },
    endReason: null,
    cameraStream: null,
    cameraFacing: "user",
    isCameraRunning: false,
    subjectSelection: null,
    subjectSegments: [],
    sessionEvents: [],
    selectSubject: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    flipCamera: vi.fn(),
    endAndSubmit: vi.fn(),
  });
}

function renderRoom() {
  return render(
    <MemoryRouter initialEntries={["/room/1?userId=7"]}>
      <RoomPage />
    </MemoryRouter>,
  );
}

const closeStaleSession = vi.hoisted(() => vi.fn(async () => null));
const postToNative = vi.hoisted(() => vi.fn());

vi.mock("@/features/study-session/closeStaleSession", () => ({ closeStaleSession }));
// 보낸 메시지를 세되 실제 브리지로도 넘겨, 앱 준비 신호를 보는 테스트가 그대로 돈다.
vi.mock("@/lib/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof BridgeModule>();
  postToNative.mockImplementation(actual.postToNative);
  return { ...actual, postToNative };
});

const TIMER_RESTORED = { ...RESTORED, source: "TIMER" as const };

function HomeProbe() {
  const location = useLocation();
  return <p data-testid="home-probe">{location.pathname}</p>;
}

function renderRoomWithHome() {
  return render(
    <MemoryRouter initialEntries={["/room/1?userId=7"]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
        <Route path="/home" element={<HomeProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RoomPage 복원 게이트", () => {
  beforeEach(() => {
    useActiveSessionRestore.mockReset();
    useStudyRoomSession.mockReset();
    listSubjects.mockReset();
    listSubjects.mockResolvedValue([]);
    stubSession();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("선택 과목 조회 실패 시 공부를 시작하지 않고 다시 시도하면 해당 과목으로 시작한다", async () => {
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: null });
    listSubjects
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue([
        { id: 3, name: "수학", colorIndex: 0, studySec: 0, focusSec: 0, tasks: [] },
      ]);
    render(
      <MemoryRouter initialEntries={["/room/1?userId=7&initialSubjectId=3"]}>
        <RoomPage />
      </MemoryRouter>,
    );
    await screen.findByText("과목을 불러오지 못했어요");
    expect(useStudyRoomSession).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "뒤로 가기" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() =>
      expect(useStudyRoomSession).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ initialSubjectId: 3 }),
      ),
    );
  });

  it("과목을 불러오지 못해 오류 화면이 뜨면 앱 덮개가 걷히도록 준비 신호를 보낸다", async () => {
    __resetLaunchReadyForTests();
    const postMessage = vi.fn();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    try {
      useActiveSessionRestore.mockReturnValue({ settled: true, restored: null });
      listSubjects.mockRejectedValue(new Error("offline"));
      render(
        <MemoryRouter initialEntries={["/room/1?userId=7&initialSubjectId=3"]}>
          <RoomPage />
        </MemoryRouter>,
      );
      await screen.findByText("과목을 불러오지 못했어요");

      const sent = postMessage.mock.calls.map(
        ([raw]) => (JSON.parse(raw as string) as { type: string }).type,
      );
      expect(sent.filter((type) => type === "launch-ready")).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("과목 조회가 실패하는 동안 새로고침해도 선택 과목이 남도록 URL을 유지한다", async () => {
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: null });
    listSubjects
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue([
        { id: 3, name: "수학", colorIndex: 0, studySec: 0, focusSec: 0, tasks: [] },
      ]);
    function Search() {
      const location = useLocation();
      return <output data-testid="search">{location.search}</output>;
    }
    render(
      <MemoryRouter initialEntries={["/room/1?userId=7&initialSubjectId=3"]}>
        <Search />
        <RoomPage />
      </MemoryRouter>,
    );
    await screen.findByText("과목을 불러오지 못했어요");
    expect(screen.getByTestId("search")).toHaveTextContent("initialSubjectId=3");
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() =>
      expect(screen.getByTestId("search")).not.toHaveTextContent("initialSubjectId"),
    );
  });

  it("결착 전에는 세션을 시작하지 않는다", () => {
    useActiveSessionRestore.mockReturnValue({ settled: false, restored: null });

    renderRoom();

    expect(useStudyRoomSession).not.toHaveBeenCalled();
  });

  it("결착 전 화면은 어두운 배경만 유지한다", () => {
    useActiveSessionRestore.mockReturnValue({ settled: false, restored: null });

    renderRoom();

    expect(screen.getByTestId("room-restore-gate")).toHaveClass("theme-dark");
  });

  it("복원 세션이면 과목 페이지를 열지 않아도 과목 목록을 받는다 — 죽기 전에 완료한 할 일을 제출에 싣기 위해", async () => {
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: RESTORED });

    renderRoom();

    await waitFor(() => {
      expect(listSubjects).toHaveBeenCalledTimes(1);
    });
  });

  it("새 세션도 과목 페이지를 열기 전에 과목 목록을 미리 받는다 — 처음 열 때 빈 골격을 기다리지 않게", async () => {
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: null });

    renderRoom();

    await waitFor(() => {
      expect(listSubjects).toHaveBeenCalledTimes(1);
    });
  });

  it("이어받은 세션은 카운트다운 없이 바로 세션을 띄운다", () => {
    setSessionCountdownSecondsForTest(3);
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: RESTORED });

    renderRoom();

    expect(screen.queryByTestId("session-countdown")).not.toBeInTheDocument();
    expect(useStudyRoomSession).toHaveBeenCalled();
  });

  it("새 세션은 세션 훅을 카운트다운 단계로 연다", () => {
    setSessionCountdownSecondsForTest(3);
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: null });

    renderRoom();

    expect(useStudyRoomSession).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ countdown: true }),
    );
  });

  it("이어받은 세션은 카운트다운 없이 연다", () => {
    setSessionCountdownSecondsForTest(3);
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: RESTORED });

    renderRoom();

    expect(useStudyRoomSession).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ countdown: false }),
    );
  });

  it("카운트다운 중에 나가도 감지 모델을 닫는다", () => {
    setSessionCountdownSecondsForTest(3);
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: null });

    const { unmount } = renderRoom();
    unmount();

    expect(visionCloses.at(-1)).toHaveBeenCalled();
  });

  it("결착하면 복원값을 세션 훅에 넘긴다", async () => {
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: RESTORED });

    renderRoom();

    await waitFor(() => {
      expect(useStudyRoomSession).toHaveBeenCalled();
    });
    expect(useStudyRoomSession).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ restored: RESTORED }),
    );
  });

  it("복원값이 없어도 세션은 시작한다", async () => {
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: null });

    renderRoom();

    await waitFor(() => {
      expect(useStudyRoomSession).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ restored: null }),
      );
    });
  });
});

describe("RoomPage 이어 공부 확인", () => {
  beforeEach(() => {
    useActiveSessionRestore.mockReset();
    useStudyRoomSession.mockReset();
    listSubjects.mockReset();
    listSubjects.mockResolvedValue([]);
    closeStaleSession.mockClear();
    postToNative.mockClear();
    stubSession();
    // 확인 창을 누른 순간 2시간 경계를 다시 재므로 마지막 보고 32분 뒤로 시계를 맞춘다.
    vi.useFakeTimers({ toFake: ["Date"], now: TIMER_RESTORED.reportedAtMs + 32 * 60_000 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("이어서 물을 기록이면 세션을 시작하지 않고 확인 창을 띄운다", () => {
    useActiveSessionRestore.mockReturnValue({
      settled: true,
      restored: TIMER_RESTORED,
      resume: { kind: "ask", awayMin: 32 },
    });

    renderRoom();

    expect(screen.getByRole("dialog", { name: "공부를 이어 갈까요?" })).toBeInTheDocument();
    expect(screen.getByText("앱 밖에 있던 32분도 공부 시간에 들어가요")).toBeInTheDocument();
    expect(useStudyRoomSession).not.toHaveBeenCalled();
  });

  it("이어서 공부하기를 고르면 공백을 공부로 이어받게 세션 훅에 넘긴다", async () => {
    useActiveSessionRestore.mockReturnValue({
      settled: true,
      restored: TIMER_RESTORED,
      resume: { kind: "ask", awayMin: 32 },
    });

    renderRoom();
    await userEvent.click(screen.getByRole("button", { name: "이어서 공부하기" }));

    await waitFor(() => {
      expect(useStudyRoomSession).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ restored: TIMER_RESTORED, resumeAway: true }),
      );
    });
  });

  it("나간 시점에서 끝내기를 고르면 기록을 확정하고 홈으로 돌아간다", async () => {
    useActiveSessionRestore.mockReturnValue({
      settled: true,
      restored: TIMER_RESTORED,
      resume: { kind: "ask", awayMin: 32 },
    });

    renderRoomWithHome();
    await userEvent.click(screen.getByRole("button", { name: "나간 시점에서 끝내기" }));

    expect(await screen.findByTestId("home-probe")).toHaveTextContent("/home");
    expect(closeStaleSession).toHaveBeenCalledWith(7);
    expect(postToNative).toHaveBeenCalledWith(expect.objectContaining({ type: "navigate-home" }));
    expect(useStudyRoomSession).not.toHaveBeenCalled();
  });

  it("창을 연 채 2시간이 지나 이어서 공부하기를 고르면 세션을 열지 않고 확정한 뒤 홈으로 돌아간다", async () => {
    useActiveSessionRestore.mockReturnValue({
      settled: true,
      restored: TIMER_RESTORED,
      resume: { kind: "ask", awayMin: 32 },
    });

    renderRoomWithHome();
    vi.setSystemTime(TIMER_RESTORED.reportedAtMs + AWAY_LIMIT_MS + 60_000);
    await userEvent.click(screen.getByRole("button", { name: "이어서 공부하기" }));

    expect(await screen.findByTestId("home-probe")).toHaveTextContent("/home");
    expect(closeStaleSession).toHaveBeenCalledWith(7);
    expect(postToNative).toHaveBeenCalledWith(expect.objectContaining({ type: "navigate-home" }));
    expect(useStudyRoomSession).not.toHaveBeenCalled();
  });

  it("홈에서 이미 이어서 공부하기를 고른 기록은 묻지 않고 공부로 이어받는다", async () => {
    useActiveSessionRestore.mockReturnValue({
      settled: true,
      restored: TIMER_RESTORED,
      resume: { kind: "confirmed" },
    });

    renderRoom();

    expect(screen.queryByRole("dialog", { name: "공부를 이어 갈까요?" })).toBeNull();
    await waitFor(() => {
      expect(useStudyRoomSession).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ resumeAway: true }),
      );
    });
  });

  it("묻지 않는 복원은 지금처럼 일시정지로 이어받는다", async () => {
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: RESTORED });

    renderRoom();

    await waitFor(() => {
      expect(useStudyRoomSession).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ restored: RESTORED, resumeAway: false }),
      );
    });
  });
});
