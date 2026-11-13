import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setSessionCountdownSecondsForTest } from "@/features/study-session/sessionCountdown";

import { RoomPage } from "../RoomPage";

const useActiveSessionRestore = vi.hoisted(() => vi.fn());
const useStudyRoomSession = vi.hoisted(() => vi.fn());
const listSubjects = vi.hoisted(() => vi.fn());

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

  it("새 세션은 카운트다운 동안 세션을 시작하지 않는다", () => {
    setSessionCountdownSecondsForTest(3);
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: null });

    renderRoom();

    expect(screen.getByTestId("session-countdown")).toBeInTheDocument();
    expect(useStudyRoomSession).not.toHaveBeenCalled();
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
