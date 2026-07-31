import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  StudySessionListResponse,
  StudySessionStreakResponse,
  StudySessionSummary,
} from "@focuson/types";
import {
  kstDateKey,
  monthLabel,
  monthOfDateKey,
  shiftMonth,
  statsQueryDateKey,
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

  it("선택일이 안 보이는 달로 이동하면 그 달 1일 조회(monthStats) 응답으로 도트를 채운다", async () => {
    const todayKey = kstDateKey();
    const nextMonth = shiftMonth(monthOfDateKey(todayKey), 1);
    // statsQueryDateKey는 오늘이 다음 달에 속하지 않으므로 항상 "다음달-01"을 돌려준다.
    const nextMonthFirstDay = statsQueryDateKey(todayKey, nextMonth);
    const recordedDateKey = `${nextMonthFirstDay.slice(0, -2)}15`;

    mockedStats.mockImplementation(async (_userId, date) =>
      date === nextMonthFirstDay
        ? { ...statsResponse(false), studiedDatesInMonth: [recordedDateKey] }
        : statsResponse(false),
    );
    mockedStreak.mockResolvedValue(streakResponse(0));

    renderRecords();
    await screen.findByText(summaryTitle(todayKey));

    await userEvent.click(screen.getByRole("button", { name: "다음 달" }));
    expect(await screen.findByText(monthLabel(nextMonth))).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "15일, 기록 있음" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "10일, 기록 없음" })).toBeInTheDocument();
  });

  it("스트릭 응답에 studiedDatesInRange가 없어도(계약 드리프트) 배너가 크래시 없이 렌더된다 — 도트는 빈 상태", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));
    mockedStreak.mockResolvedValue({
      streak: 4,
      maxStreak: 9,
    } as unknown as StudySessionStreakResponse);

    renderRecords();

    expect(await screen.findByText("4일 연속 공부 중")).toBeInTheDocument();
    // doneDates가 빈 배열로 방어되어 오늘을 제외한 모든 요일 도트가 "기록 없음"이다.
    expect(screen.queryByRole("img", { name: /공부함/ })).not.toBeInTheDocument();
  });

  it("세션은 시작 시각 내림차순으로 정렬되고 아이템 사이에 구분선이 렌더된다", async () => {
    function session(overrides: Partial<StudySessionSummary>): StudySessionSummary {
      return {
        id: 1,
        statDate: "2026-01-01",
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T01:00:00.000Z",
        studySec: 3600,
        focusSec: 1800,
        focusRate: 50,
        eventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, PAUSE: 0 },
        ...overrides,
      };
    }
    // API 응답 순서를 일부러 비정렬로 둔다(이른 → 늦은 → 중간) — 화면이 재정렬해야 한다.
    const early = session({ id: 1, startedAt: "2026-01-01T00:00:00.000Z", focusSec: 600 });
    const late = session({ id: 2, startedAt: "2026-01-01T10:00:00.000Z", focusSec: 1800 });
    const mid = session({ id: 3, startedAt: "2026-01-01T05:00:00.000Z", focusSec: 1200 });

    mockedStats.mockResolvedValue({
      ...statsResponse(false),
      sessions: [early, late, mid],
      sessionCount: 3,
      // 요약 타일 값은 세션 개별 표기(10분/20분/30분)와 겹치지 않게 둔다.
      totalStudySec: 5000,
      totalFocusSec: 4000,
    });
    mockedStreak.mockResolvedValue(streakResponse(0));

    const { container } = renderRecords();

    await screen.findByText(summaryTitle(kstDateKey()));
    const durations = screen.getAllByText(/^(10분|20분|30분)$/).map((el) => el.textContent);
    // 내림차순(최신순 고정) — late(30분) → mid(20분) → early(10분).
    expect(durations).toEqual(["30분", "20분", "10분"]);
    // 3개 아이템 사이 헤어라인은 2개다.
    expect(container.querySelectorAll(".h-px.bg-border")).toHaveLength(2);
  });

  it("userId가 없으면 데이터 조회 없이 단독 모드 안내만 보여준다", () => {
    renderRecords("/records");

    expect(screen.getByText(/userId 없음/)).toBeInTheDocument();
    expect(mockedStats).not.toHaveBeenCalled();
    expect(mockedStreak).not.toHaveBeenCalled();
  });
});
