import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readStartSubject, saveStartSubject } from "@/features/study-session/startSubject";

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

function stubSession(overrides: Record<string, unknown> = {}) {
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
    discardSubject: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    flipCamera: vi.fn(),
    endAndSubmit: vi.fn(),
    ...overrides,
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
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
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

  it("복원한 세션의 과목이 다른 곳에서 삭제됐으면 목록을 받은 뒤 과목 줄을 `과목`으로 보인다", async () => {
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: RESTORED });
    stubSession({ subjectSelection: 99 });

    renderRoom();

    expect(await screen.findByRole("button", { name: /^과목.*순공/ })).toBeInTheDocument();
  });

  it("새 세션이면 홈에서 고른 과목을 세션 훅에 넘기고 기록을 삭제한다", async () => {
    saveStartSubject(7, 3, Date.now());
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: null });

    renderRoom();

    await waitFor(() => {
      expect(useStudyRoomSession).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ initialSubjectId: 3 }),
      );
    });
    expect(readStartSubject(Date.now())).toBeNull();
  });

  it("이전 세션을 복구하면 홈에서 고른 과목을 넘기지 않고 기록은 삭제한다", async () => {
    saveStartSubject(7, 3, Date.now());
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: RESTORED });

    renderRoom();

    await waitFor(() => {
      expect(useStudyRoomSession).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ restored: RESTORED, initialSubjectId: null }),
      );
    });
    expect(readStartSubject(Date.now())).toBeNull();
  });

  it("다른 사용자가 남긴 기록은 넘기지 않고 삭제한다", async () => {
    saveStartSubject(8, 3, Date.now());
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: null });

    renderRoom();

    await waitFor(() => {
      expect(useStudyRoomSession).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ initialSubjectId: null }),
      );
    });
    expect(readStartSubject(Date.now())).toBeNull();
  });

  it("확인을 기다리는 동안에도 기록은 들어오자마자 읽어 둔다", async () => {
    saveStartSubject(7, 3, Date.now());
    useActiveSessionRestore.mockReturnValue({ settled: false, restored: null });

    const { rerender } = renderRoom();
    expect(readStartSubject(Date.now())).toBeNull();
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: null });
    rerender(
      <MemoryRouter initialEntries={["/room/1?userId=7"]}>
        <RoomPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(useStudyRoomSession).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ initialSubjectId: 3 }),
      );
    });
  });
});
