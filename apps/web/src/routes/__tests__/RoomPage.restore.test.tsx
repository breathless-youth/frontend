import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    subjectTimes: [],
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

  it("결착 전에는 세션을 시작하지 않는다", () => {
    useActiveSessionRestore.mockReturnValue({ settled: false, restored: null });

    renderRoom();

    expect(useStudyRoomSession).not.toHaveBeenCalled();
  });

  it("결착 전 화면은 어두운 배경만 유지한다", () => {
    useActiveSessionRestore.mockReturnValue({ settled: false, restored: null });

    renderRoom();

    expect(screen.getByTestId("room-restore-gate")).toBeInTheDocument();
  });

  it("복원 세션이면 시트를 열지 않아도 과목 목록을 받는다 — 죽기 전에 완료한 할 일을 제출에 싣기 위해", async () => {
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: RESTORED });

    renderRoom();

    await waitFor(() => {
      expect(listSubjects).toHaveBeenCalledTimes(1);
    });
  });

  it("새 세션은 시트를 열기 전엔 과목 목록을 받지 않는다", async () => {
    useActiveSessionRestore.mockReturnValue({ settled: true, restored: null });

    renderRoom();

    await waitFor(() => {
      expect(useStudyRoomSession).toHaveBeenCalled();
    });
    expect(listSubjects).not.toHaveBeenCalled();
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
