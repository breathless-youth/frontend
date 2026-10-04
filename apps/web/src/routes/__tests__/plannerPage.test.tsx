import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudySessionListResponse, StudySessionSummary } from "@focusmakers/types";

import { addDaysToDateKey } from "@/features/records/recordsFormat";
import { plannerTodayKey } from "@/features/planner/plannerDay";
import { trackPlannerDateChanged, trackPlannerOpened } from "@/lib/amplitude";
import { getDday } from "@/lib/ddayApi";
import { listStudySessionStats } from "@/lib/statsApi";
import { listSubjects } from "@/lib/subjectApi";
import { PlannerPage } from "@/routes/PlannerPage";

vi.mock("@/lib/statsApi", () => ({ listStudySessionStats: vi.fn(), getPeriodStats: vi.fn() }));
vi.mock("@/lib/subjectApi", () => ({ listSubjects: vi.fn() }));
vi.mock("@/lib/ddayApi", () => ({ getDday: vi.fn() }));
vi.mock("@/lib/amplitude", () => ({
  trackPlannerOpened: vi.fn(),
  trackPlannerDateChanged: vi.fn(),
  trackScreenBackPressed: vi.fn(),
  trackErrorRetryPressed: vi.fn(),
  trackSubjectItemAdded: vi.fn(),
}));

// jsdom에는 `PointerEvent` 구현이 없다 — 스와이프 판정에 쓰는 `clientX`가 사라지지 않게 한다.
if (typeof window.PointerEvent === "undefined") {
  window.PointerEvent = MouseEvent as unknown as typeof PointerEvent;
}

const mockedStats = vi.mocked(listStudySessionStats);
const mockedSubjects = vi.mocked(listSubjects);
const mockedDday = vi.mocked(getDday);

const TODAY = plannerTodayKey();
const YESTERDAY = addDaysToDateKey(TODAY, -1);
const kst = (day: string, hour: number, minute = 0) =>
  new Date(
    `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`,
  ).toISOString();

function stats(sessions: StudySessionSummary[] = []): StudySessionListResponse {
  return {
    sessions,
    sessionCount: sessions.length,
    totalStudySec: 0,
    totalFocusSec: 0,
    longestFocusSec: 0,
    focusRate: 0,
    totalEventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, SLEEP: 0, PAUSE: 0 },
    studiedDatesInMonth: [],
    subjects: [{ id: 3, name: "영어", colorIndex: 7, deleted: false }],
  };
}

/** 어제 09:00~11:00 — 영어 1시간(휴대폰 10분 포함), 그 뒤 과목 없이 1시간. */
function studiedYesterday(): StudySessionSummary {
  return {
    id: 1,
    statDate: YESTERDAY,
    startedAt: kst(YESTERDAY, 9),
    endedAt: kst(YESTERDAY, 11),
    studySec: 7200,
    focusSec: 6600,
    focusRate: 92,
    eventCounts: { AWAY: 0, PHONE: 1, DEVICE: 0, SLEEP: 0, PAUSE: 0 },
    events: [{ status: "PHONE", startedAt: kst(YESTERDAY, 9, 20), endedAt: kst(YESTERDAY, 9, 30) }],
    subjectSegments: [
      {
        subjectId: 3,
        startedAt: kst(YESTERDAY, 9),
        endedAt: kst(YESTERDAY, 10),
        studySec: 3600,
        focusSec: 3000,
      },
    ],
    completedTasks: [{ id: 9, name: "단어 60개 암기", subjectId: 3, deleted: false }],
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderPlanner(path: string, state?: unknown) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: "/planner", search: path, state }]}>
        <Routes>
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/records" element={<p>기록 탭</p>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PlannerPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedStats.mockImplementation((date) =>
      Promise.resolve(date === YESTERDAY ? stats([studiedYesterday()]) : stats()),
    );
    mockedSubjects.mockResolvedValue([]);
    mockedDday.mockResolvedValue(null);
  });

  it("지난 날 플래너는 머리에 그날 순공·총 공부시간을, 왼쪽에 과목별 순공과 완료한 할 일을 보여준다", async () => {
    renderPlanner(`?userId=7&date=${YESTERDAY}`, { via: "records" });

    const english = await screen.findByRole("heading", { name: "영어" });
    expect(english.closest("section")).toHaveTextContent("50분");
    expect(screen.getByText("단어 60개 암기")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "완료" })).toBeInTheDocument();
    // 과목 없이 공부한 1시간은 따로 보인다.
    expect(
      screen.getByRole("heading", { name: "과목 없이 공부" }).closest("section"),
    ).toHaveTextContent("1시간");
    expect(screen.getByText("과목 없음")).toBeInTheDocument();

    const head = screen.getByText("순공시간").parentElement!;
    expect(within(head).getByText("1시간 50분")).toBeInTheDocument();
    expect(head).toHaveTextContent("총 공부시간 2시간");
    expect(vi.mocked(trackPlannerOpened)).toHaveBeenCalledWith({ via: "records", isToday: false });
    // 지난 날은 과목 목록을 조회하지 않는다.
    expect(mockedSubjects).not.toHaveBeenCalled();
  });

  it("타임테이블은 5시에서 시작하고, 과목·휴식·과목 없는 순공을 구분해 칠한다", async () => {
    const { container } = renderPlanner(`?userId=7&date=${YESTERDAY}`);

    const timetable = await screen.findByRole("img", { name: /시간대별 공부 분포/ });
    expect(timetable.firstElementChild).toHaveTextContent(/^5$/);
    expect(timetable.lastElementChild).toHaveTextContent(/^4$/);
    await waitFor(() => {
      expect(container.querySelector('[data-paint="subject"]')).not.toBeNull();
    });
    expect(container.querySelector('[data-paint="subject"]')).toHaveStyle({
      background: "var(--subject-7)",
    });
    expect(container.querySelector('[data-paint="rest"]')).toHaveClass("bg-chart-rest");
    expect(container.querySelector('[data-paint="focus"]')).toHaveClass("bg-primary");
  });

  it("오늘 플래너는 과목 목록을 전부 보여주고, 다음 날로는 넘어가지 않는다", async () => {
    mockedSubjects.mockResolvedValue([
      {
        id: 3,
        name: "영어",
        colorIndex: 7,
        studySec: 0,
        focusSec: 0,
        tasks: [{ id: 21, name: "리스닝 모의고사 1회", doneAt: null }],
      },
    ]);

    renderPlanner("?userId=7");

    expect(await screen.findByRole("heading", { name: "영어" })).toBeInTheDocument();
    expect(screen.getByText("리스닝 모의고사 1회")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "미완료" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다음 날" })).toBeDisabled();
    expect(vi.mocked(trackPlannerOpened)).toHaveBeenCalledWith({ via: "unknown", isToday: true });
  });

  it("전날·다음 날 버튼과 좌우 스와이프로 날짜를 넘기고, 셸이 붙인 쿼리는 유지한다", async () => {
    renderPlanner(`?userId=7&date=${YESTERDAY}`);
    await screen.findByRole("heading", { name: "영어" });

    await userEvent.click(screen.getByRole("button", { name: "전날" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      `/planner?userId=7&date=${addDaysToDateKey(YESTERDAY, -1)}`,
    );
    expect(vi.mocked(trackPlannerDateChanged)).toHaveBeenLastCalledWith({
      delta: -1,
      method: "button",
    });

    // 왼쪽으로 스와이프 → 다음 날.
    const swipeArea = screen.getByTestId("planner-swipe-area");
    fireEvent.pointerDown(swipeArea, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(swipeArea, { clientX: 220, clientY: 205 });
    expect(screen.getByTestId("location")).toHaveTextContent(`date=${YESTERDAY}`);
    expect(vi.mocked(trackPlannerDateChanged)).toHaveBeenLastCalledWith({
      delta: 1,
      method: "swipe",
    });
  });

  it("D-Day가 설정돼 있으면 날짜 아래에 보여주고, 없으면 그 줄을 생략한다", async () => {
    mockedDday.mockResolvedValue({ title: "수능", targetDate: addDaysToDateKey(YESTERDAY, 10) });

    renderPlanner(`?userId=7&date=${YESTERDAY}`);

    // 일수는 플래너 날짜 기준으로 센다.
    expect(await screen.findByText("D-10")).toBeInTheDocument();
    expect(screen.getByText(/수능/)).toBeInTheDocument();
  });

  it("기록이 없는 지난 날은 빈 상태 문구를 보여준다", async () => {
    renderPlanner(`?userId=7&date=${addDaysToDateKey(YESTERDAY, -3)}`);

    expect(await screen.findByText("이 날은 기록이 없어요")).toBeInTheDocument();
    expect(screen.getByText("완료한 할 일도 없어요")).toBeInTheDocument();
    expect(screen.queryByText(/^D-/)).not.toBeInTheDocument();
  });

  it("미래 날짜나 형식이 틀린 날짜로 열면 오늘 플래너를 연다", async () => {
    renderPlanner(`?userId=7&date=${addDaysToDateKey(TODAY, 5)}`);

    await waitFor(() => expect(mockedStats).toHaveBeenCalledWith(TODAY));
    expect(screen.getByRole("button", { name: "다음 날" })).toBeDisabled();
  });

  it("조회가 실패하면 오류 문구와 다시 시도를 보여준다", async () => {
    mockedStats.mockRejectedValue(new Error("network"));

    renderPlanner(`?userId=7&date=${YESTERDAY}`);

    expect(await screen.findByText("플래너를 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });
});
