import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoomPage } from "../RoomPage";

/**
 * 시계 보기 형식의 RoomPage 연결만 본다.
 * 보기별 숫자와 문구는 `SessionClock.test.tsx`가 본다.
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

const loadTodayTotals = vi.hoisted(() => vi.fn(async () => ({ studySec: 0, focusSec: 0 })));
vi.mock("@/features/study-session/loadSessionSubjects", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadTodayTotals,
}));

const amplitude = vi.hoisted(() => ({
  trackSessionClockViewChanged: vi.fn(),
  trackStudySessionEnded: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...amplitude,
}));

function renderRoom(path = "/room/7?userId=1") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/room/:id" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function chooseMenu(name: string) {
  await userEvent.click(screen.getByRole("button", { name: "더보기" }));
  await userEvent.click(screen.getByRole("menuitem", { name }));
}

describe("RoomPage 시계 보기 형식", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("처음에는 순공 보기이고, 더보기에서 공부 시간 보기로 바꾸면 다음 세션에도 유지된다", async () => {
    renderRoom();
    expect(screen.getByRole("status")).toHaveTextContent("현재 집중");

    await chooseMenu("공부 시간으로 보기");
    expect(screen.getByRole("status")).toHaveTextContent("현재 공부");
    expect(amplitude.trackSessionClockViewChanged).toHaveBeenCalledWith({ view: "study" });

    cleanup();
    renderRoom();
    expect(screen.getByRole("status")).toHaveTextContent("현재 공부");
    await chooseMenu("순공으로 보기");
    expect(screen.getByRole("status")).toHaveTextContent("현재 집중");
  });

  it("오늘 줄은 서버에 저장된 오늘 값에 이번 세션 값을 더해 보인다", async () => {
    loadTodayTotals.mockResolvedValueOnce({ studySec: 7200, focusSec: 3600 });
    renderRoom();

    expect(await screen.findByText("01:00:00")).toBeInTheDocument();
    await chooseMenu("공부 시간으로 보기");
    expect(screen.getByText("02:00:00")).toBeInTheDocument();
  });

  it("비집중은 원인과 상관없이 같은 문구로 알린다", async () => {
    vi.useFakeTimers();
    try {
      renderRoom("/room/7?userId=1&detector=mock");
      const detector = window.__focusonMockDetector;
      await act(async () => {
        detector!.emit({ source: "PHONE", active: true });
        await vi.advanceTimersByTimeAsync(10_200);
      });
      expect(screen.getByRole("status")).toHaveTextContent("자리를 확인해 주세요");
    } finally {
      vi.useRealTimers();
    }
  });
});
