import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudySessionListResponse, StudySessionStreakResponse } from "@focuson/types";
import {
  kstDateKey,
  monthLabel,
  monthOfDateKey,
  shiftMonth,
  summaryTitle,
} from "@/features/records/recordsFormat";
import { getStreak, listStudySessionStats } from "@/lib/statsApi";
import { RecordsPage } from "@/routes/RecordsPage";

/**
 * (모바일판 `__tests__/records.test.tsx`에서 케이스 이식 — BY-330.
 * RN판은 fake timers로 "오늘"을 고정하지만, 웹판은 오늘을 매 렌더 계산으로 바꿨다
 * (`RecordsPage`의 RN판 차이 주석 참고) — 시계를 고정하는 대신 테스트가 `recordsFormat`의
 * 같은 순수 함수로 기대값을 계산한다. 실행 날짜와 무관하게 항상 맞는다.)
 */
vi.mock("@/lib/statsApi", () => ({
  listStudySessionStats: vi.fn(),
  getStreak: vi.fn(),
}));

const mockedStats = vi.mocked(listStudySessionStats);
const mockedStreak = vi.mocked(getStreak);

function statsResponse(hasSession: boolean): StudySessionListResponse {
  return {
    sessions: hasSession
      ? [
          {
            id: 1,
            statDate: "2026-01-01",
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T01:00:00.000Z",
            studySec: 3600,
            focusSec: 1800,
            focusRate: 50,
            eventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, PAUSE: 0 },
          },
        ]
      : [],
    sessionCount: hasSession ? 1 : 0,
    totalStudySec: hasSession ? 3600 : 0,
    totalFocusSec: hasSession ? 1800 : 0,
    longestFocusSec: hasSession ? 1800 : 0,
    focusRate: hasSession ? 50 : 0,
    totalEventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, PAUSE: 0 },
    studiedDatesInMonth: [],
  };
}

const streakResponse = (streak: number): StudySessionStreakResponse => ({
  streak,
  maxStreak: streak,
  studiedDatesInRange: [],
});

function renderRecords(path = "/records?userId=7") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <RecordsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RecordsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("선택일(기본값 오늘) 요약과 그 날의 공부 기록 리스트를 보여준다", async () => {
    mockedStats.mockResolvedValue(statsResponse(true));
    mockedStreak.mockResolvedValue(streakResponse(5));

    renderRecords();

    await screen.findByText(summaryTitle(kstDateKey()));
    expect(screen.getByText("순공시간")).toBeInTheDocument();
    expect(screen.getByText("공부 기록")).toBeInTheDocument();
    expect(screen.getByText("1회")).toBeInTheDocument();
    expect(screen.queryByText("이날은 기록이 없어요")).not.toBeInTheDocument();
  });

  it("달 이동은 달력만 바꾸고 선택일 요약은 그대로 유지한다(2026-07-28 확정 정책)", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));
    mockedStreak.mockResolvedValue(streakResponse(0));

    renderRecords();

    const todayKey = kstDateKey();
    const currentMonth = monthOfDateKey(todayKey);
    await screen.findByText(summaryTitle(todayKey));

    await userEvent.click(screen.getByRole("button", { name: "다음 달" }));

    expect(screen.getByText(monthLabel(shiftMonth(currentMonth, 1)))).toBeInTheDocument();
    expect(screen.getByText(summaryTitle(todayKey))).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "이전 달" }));
    expect(screen.getByText(monthLabel(currentMonth))).toBeInTheDocument();
  });

  it("스트릭 배너 — 로딩 중에는 스켈레톤만 보여준다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));
    mockedStreak.mockImplementation(() => new Promise(() => undefined)); // 영원히 pending

    renderRecords();

    await screen.findByText(summaryTitle(kstDateKey()));
    expect(screen.getByLabelText("불러오는 중")).toBeInTheDocument();
    expect(screen.queryByText(/일 연속 공부 중/)).not.toBeInTheDocument();
  });

  it("스트릭 배너 — 조회 실패(캐시 없음)면 감춘다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));
    mockedStreak.mockRejectedValue(new Error("network"));

    renderRecords();

    await screen.findByText(summaryTitle(kstDateKey()));
    expect(screen.queryByText(/일 연속 공부 중/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("불러오는 중")).not.toBeInTheDocument();
  });

  it("스트릭 배너 — 성공하면 연속 일수 문구를 보여준다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));
    mockedStreak.mockResolvedValue(streakResponse(12));

    renderRecords();

    expect(await screen.findByText("12일 연속 공부 중")).toBeInTheDocument();
  });

  it("일별 기록 조회 실패 시 오류 문구와 다시 시도를 보여주고, 재시도로 복구한다", async () => {
    mockedStats.mockRejectedValueOnce(new Error("network"));
    mockedStreak.mockResolvedValue(streakResponse(0));

    renderRecords();

    await screen.findByText("기록을 불러오지 못했어요");

    mockedStats.mockResolvedValue(statsResponse(false));
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await screen.findByText(summaryTitle(kstDateKey()));
    await waitFor(() => expect(mockedStats).toHaveBeenCalledTimes(2));
  });

  it("userId가 없으면 데이터 조회 없이 단독 모드 안내만 보여준다", () => {
    renderRecords("/records");

    expect(screen.getByText(/userId 없음/)).toBeInTheDocument();
    expect(mockedStats).not.toHaveBeenCalled();
    expect(mockedStreak).not.toHaveBeenCalled();
  });
});
