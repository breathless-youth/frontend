import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DayTaskItem,
  StudySessionListResponse,
  StudySessionSummary,
} from "@focusmakers/types";

import { plannerDateKeyOf } from "@/features/planner/plannerDay";
import {
  addDaysToDateKey,
  dayTitleWithWeekday,
  kstDateKey,
} from "@/features/records/recordsFormat";
import { trackPlannerDateChanged, trackPlannerOpened } from "@/lib/amplitude";
import { getDday } from "@/lib/ddayApi";
import { listStudySessionStats } from "@/lib/statsApi";
import { listSubjects, listSubjectsOnDay } from "@/lib/subjectApi";
import type * as UserIdModule from "@/lib/userId";
import { PlannerPage } from "@/routes/PlannerPage";
import { enterGlassChrome, pressNative, resetGlassChrome } from "@/test/nativeControlStub";

vi.mock("@/lib/statsApi", () => ({ listStudySessionStats: vi.fn(), getPeriodStats: vi.fn() }));
vi.mock("@/lib/subjectApi", () => ({ listSubjects: vi.fn(), listSubjectsOnDay: vi.fn() }));
vi.mock("@/lib/ddayApi", () => ({ getDday: vi.fn() }));
vi.mock("@/lib/amplitude", () => ({
  trackPlannerOpened: vi.fn(),
  trackPlannerDateChanged: vi.fn(),
  trackScreenBackPressed: vi.fn(),
  trackErrorRetryPressed: vi.fn(),
}));

// 토큰 문서 여부만 바꾼다. 신원은 그대로 `?userId=`에서 읽는다.
const tokenMock = vi.hoisted(() => ({ has: false }));
vi.mock("@/lib/userId", async (importOriginal) => ({
  ...(await importOriginal<typeof UserIdModule>()),
  hasTokenSource: () => tokenMock.has,
}));

// jsdom에는 `PointerEvent` 구현이 없어 스와이프 판정에 쓰는 좌표와 `isPrimary`를 채운다.
class TestPointerEvent extends MouseEvent {
  readonly isPrimary = true;
  readonly pointerId = 1;
  readonly pointerType = "touch";
}
window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;

const mockedStats = vi.mocked(listStudySessionStats);
const mockedSubjects = vi.mocked(listSubjects);
const mockedDday = vi.mocked(getDday);
const mockedSubjectsOnDay = vi.mocked(listSubjectsOnDay);

// 화면의 오늘은 홈과 같이 05시에 바뀌어 새벽에 돌려도 같은 날을 오늘로 본다.
const TODAY = plannerDateKeyOf(new Date());
const YESTERDAY = addDaysToDateKey(TODAY, -1);
const kst = (day: string, hour: number, minute = 0) =>
  new Date(
    `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`,
  ).toISOString();

function stats(
  sessions: StudySessionSummary[] = [],
  tasks?: DayTaskItem[],
): StudySessionListResponse {
  return {
    sessions,
    sessionCount: sessions.length,
    totalStudySec: 0,
    totalFocusSec: 0,
    longestFocusSec: 0,
    focusRate: 0,
    totalEventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, SLEEP: 0, PAUSE: 0 },
    studiedDatesInMonth: [],
    // `tasks`를 주면 과목에 그날의 할 일이 실려 온 응답이다. 안 주면 과목별 할 일을 싣지 않는 서버의 응답.
    subjects: [
      {
        id: 3,
        name: "영어",
        colorIndex: 7,
        deleted: false,
        ...(tasks === undefined ? {} : { tasks }),
      },
    ],
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
    completedTasks: [],
  };
}

/** 어제 14:00~15:30 영어 수동 기록. */
function manualYesterday(): StudySessionSummary {
  return {
    id: 2,
    statDate: YESTERDAY,
    startedAt: kst(YESTERDAY, 14),
    endedAt: kst(YESTERDAY, 15, 30),
    studySec: 5400,
    focusSec: 5400,
    focusRate: 100,
    eventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, SLEEP: 0, PAUSE: 0 },
    events: [],
    subjectSegments: [
      {
        subjectId: 3,
        startedAt: kst(YESTERDAY, 14),
        endedAt: kst(YESTERDAY, 15, 30),
        studySec: 5400,
        focusSec: 5400,
      },
    ],
    completedTasks: [],
    source: "MANUAL",
    submissionStartedAt: kst(YESTERDAY, 14),
  };
}

/** 어제 완료한 할 일 — 세션 중(09:40)에 하나, 세션 없이 밤(22:10)에 하나. */
function completedYesterday(): DayTaskItem[] {
  return [
    { id: 9, name: "단어 60개 암기", done: true, doneAt: kst(YESTERDAY, 9, 40), deleted: false },
    { id: 10, name: "오답 노트", done: true, doneAt: kst(YESTERDAY, 22, 10), deleted: false },
    // 어제도 미완료였던 할 일. 지난 날 플래너에는 보이지 않는다.
    { id: 11, name: "어제 못 끝낸 일", done: false, doneAt: null, deleted: false },
  ];
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderPlanner(
  path: string,
  state?: unknown,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: "/planner", search: path, state }]}>
        <Routes>
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/records" element={<p>기록 탭</p>} />
          <Route path="/home" element={<p>홈 탭</p>} />
          <Route path="/manual-record" element={<p>입력 화면</p>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// 시트는 나눠 받는다. 전체 스위트 부하에서는 첫 열기의 시트 모듈 받기가 findBy 기본 1초를 넘겨 미리 받아 둔다.
beforeAll(async () => {
  await import("@/features/records/PeriodPickerSheet");
});

describe("PlannerPage", () => {
  beforeEach(() => {
    tokenMock.has = false;
    vi.clearAllMocks();
    mockedStats.mockImplementation((date) =>
      Promise.resolve(
        date === YESTERDAY ? stats([studiedYesterday()], completedYesterday()) : stats(),
      ),
    );
    mockedSubjects.mockResolvedValue([]);
    // 날짜별 과목 조회가 없는 서버가 기본이다.
    mockedSubjectsOnDay.mockRejectedValue(new Error("날짜별 과목 조회 실패 (HTTP 404)"));
    mockedDday.mockResolvedValue(null);
  });

  it("지난 날은 홈과 같이 그날 있던 과목을 기록이 없어도 0분으로 보이고, 그 뒤에 만든 과목은 뺀다", async () => {
    const day = addDaysToDateKey(YESTERDAY, -3);
    mockedSubjects.mockResolvedValue([
      { id: 3, name: "영어", colorIndex: 7, studySec: 0, focusSec: 0, tasks: [] },
      { id: 5, name: "수학", colorIndex: 2, studySec: 0, focusSec: 0, tasks: [] },
    ]);
    const entry = { studySec: 0, focusSec: 0, completed: false, completedAt: null };
    mockedSubjectsOnDay.mockResolvedValue([
      { id: 3, name: "영어", colorIndex: 7, deleted: false, ...entry },
      { id: 9, name: "한국사", colorIndex: 12, deleted: true, ...entry },
    ]);

    renderPlanner(`?userId=7&date=${day}`);

    const english = await screen.findByRole("heading", { name: "영어" });
    expect(english.closest("section")).toHaveTextContent(/^영어0분$/);
    expect(screen.getByRole("heading", { name: "한국사" }).closest("section")).toHaveTextContent(
      /^한국사0분$/,
    );
    expect(screen.queryByRole("heading", { name: "수학" })).not.toBeInTheDocument();
    expect(mockedSubjectsOnDay).toHaveBeenCalledWith(day);
  });

  it("다시 열면 캐시에 남은 예전 과목을 그리지 않고 이번에 새로 받은 과목을 기다린다", async () => {
    const day = addDaysToDateKey(YESTERDAY, -3);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const live = (id: number, name: string) => ({
      id,
      name,
      colorIndex: id,
      studySec: 0,
      focusSec: 0,
      tasks: [],
    });
    const onDay = (id: number, name: string) => ({
      id,
      name,
      colorIndex: id,
      deleted: false,
      studySec: 0,
      focusSec: 0,
      completed: false,
      completedAt: null,
    });
    mockedSubjects.mockResolvedValue([live(3, "영어")]);
    mockedSubjectsOnDay.mockResolvedValue([onDay(3, "영어")]);
    const first = renderPlanner(`?userId=7&date=${day}`, undefined, queryClient);
    expect(await screen.findByRole("heading", { name: "영어" })).toBeInTheDocument();
    first.unmount();

    mockedSubjects.mockResolvedValue([live(5, "수학")]);
    let finishDay: (entries: ReturnType<typeof onDay>[]) => void = () => undefined;
    mockedSubjectsOnDay.mockReturnValue(
      new Promise((resolve) => {
        finishDay = resolve;
      }),
    );
    renderPlanner(`?userId=7&date=${day}`, undefined, queryClient);
    // 그날 기록과 지금 과목은 다시 받아 끝났고 그날 과목만 받는 중이다.
    await waitFor(() => expect(mockedSubjectsOnDay).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockedSubjects).toHaveBeenCalledTimes(2));
    await act(() => Promise.resolve());
    expect(screen.queryByRole("heading", { name: "영어" })).not.toBeInTheDocument();

    await act(async () => finishDay([onDay(5, "수학")]));

    expect(await screen.findByRole("heading", { name: "수학" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "영어" })).not.toBeInTheDocument();
  });

  it("지금 과목 조회까지 실패하면 그날 기록이 있는 과목만 남는다", async () => {
    mockedSubjects.mockRejectedValue(new Error("network"));
    const entry = { studySec: 0, focusSec: 0, completed: false, completedAt: null };
    mockedSubjectsOnDay.mockResolvedValue([
      { id: 3, name: "영어", colorIndex: 7, deleted: false, ...entry },
      { id: 5, name: "수학", colorIndex: 2, deleted: false, ...entry },
    ]);

    renderPlanner(`?userId=7&date=${YESTERDAY}`);

    const english = await screen.findByRole("heading", { name: "영어" });
    expect(english.closest("section")).toHaveTextContent("50분");
    expect(screen.queryByRole("heading", { name: "수학" })).not.toBeInTheDocument();
  });

  it("오늘은 지금 과목을 모두 보이고, 날짜별 과목 조회가 실패한 지난 날도 지금 과목을 모두 보인다", async () => {
    mockedSubjects.mockResolvedValue([
      { id: 3, name: "영어", colorIndex: 7, studySec: 0, focusSec: 0, tasks: [] },
      { id: 5, name: "수학", colorIndex: 2, studySec: 0, focusSec: 0, tasks: [] },
    ]);
    const { unmount } = renderPlanner("?userId=7");
    expect(await screen.findByRole("heading", { name: "수학" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "영어" })).toBeInTheDocument();
    unmount();

    renderPlanner(`?userId=7&date=${addDaysToDateKey(YESTERDAY, -3)}`);
    expect(await screen.findByRole("heading", { name: "수학" })).toBeInTheDocument();
  });

  it("지난 날은 머리에 그날 순공·총 공부시간을, 왼쪽에 과목별 순공만 할 일 없이 보여준다", async () => {
    renderPlanner(`?userId=7&date=${YESTERDAY}`, { via: "records" });

    const english = await screen.findByRole("heading", { name: "영어" });
    expect(english.closest("section")).toHaveTextContent("50분");
    // 할 일은 조회 전용 타임테이블에 보이지 않는다.
    expect(screen.queryByText("단어 60개 암기")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText("휴식")).toBeInTheDocument();
    // 지금 과목은 달력 날짜로 받아서, 새벽 0~5시에는 화면의 오늘 다음 날도 조회한다.
    expect(new Set(mockedStats.mock.calls.map(([date]) => date))).toEqual(
      new Set([YESTERDAY, TODAY, kstDateKey()]),
    );
    // 과목 없이 공부한 1시간은 `과목 없음` 행으로 따로 보이고, 범례에도 같은 이름이 있다.
    expect(screen.getByRole("heading", { name: "과목 없음" }).closest("section")).toHaveTextContent(
      "1시간",
    );
    expect(screen.getAllByText("과목 없음")).toHaveLength(2);

    const head = screen.getByText("순공시간").parentElement!;
    expect(within(head).getByText("1시간 50분")).toBeInTheDocument();
    expect(head).toHaveTextContent("총 2시간");
    expect(vi.mocked(trackPlannerOpened)).toHaveBeenCalledWith({ via: "records", isToday: false });
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

  it("과목·할 일 관리, 시간 직접 입력, 칸 누르기 입구가 없다", async () => {
    tokenMock.has = true;
    mockedStats.mockImplementation((date) =>
      Promise.resolve(
        date === YESTERDAY
          ? stats([studiedYesterday(), manualYesterday()], completedYesterday())
          : stats(),
      ),
    );
    renderPlanner(`?userId=7&date=${YESTERDAY}`);
    await screen.findByRole("heading", { name: "영어" });

    expect(screen.queryByRole("button", { name: "시간 직접 입력" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "과목 추가" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "할 일 추가" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^수동 기록, / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /영어/ })).not.toBeInTheDocument();
    // 칸은 버튼이 아니라 그림이라 눌러도 입력 화면으로 가지 않는다.
    expect(
      within(screen.getByRole("img", { name: /시간대별 공부 분포/ })).queryAllByRole("button"),
    ).toHaveLength(0);
  });

  it("다음 날은 오늘까지만 넘어가고, 미래 날짜로 열면 오늘을 연다", async () => {
    renderPlanner(`?userId=7&date=${addDaysToDateKey(TODAY, 3)}`);
    expect(
      await screen.findByRole("button", { name: dayTitleWithWeekday(TODAY, true) }),
    ).toBeInTheDocument();
    expect(mockedStats.mock.calls.map(([date]) => date)).not.toContain(addDaysToDateKey(TODAY, 3));

    const next = screen.getByRole("button", { name: "다음 날" });
    expect(next).toBeDisabled();
    const swipeArea = screen.getByTestId("planner-swipe-area");
    fireEvent.pointerDown(swipeArea, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(swipeArea, { clientX: 220, clientY: 205 });
    expect(vi.mocked(trackPlannerDateChanged)).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: dayTitleWithWeekday(TODAY, true) }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: dayTitleWithWeekday(TODAY, true) }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("button", { name: "다음 달" })).toBeDisabled();
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

  it("날짜를 누르면 날짜 선택 시트가 열리고, 고른 날의 플래너로 옮긴다", async () => {
    renderPlanner(`?userId=7&date=${YESTERDAY}`);
    await screen.findByRole("heading", { name: "영어" });
    const picked = addDaysToDateKey(YESTERDAY, -2);
    const [, pickedMonth, pickedDay] = picked.split("-").map(Number);

    await userEvent.click(screen.getByRole("button", { name: /^\d+월 \d+일 .$/ }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("날짜 선택")).toBeInTheDocument();
    // 시트는 보고 있는 날의 달을 편다. 그 달이 아니면 이전 달로 넘긴다.
    const dayName = new RegExp(`${String(pickedMonth)}월 ${String(pickedDay)}일$`);
    if (within(sheet).queryByRole("button", { name: dayName }) === null) {
      await userEvent.click(within(sheet).getByRole("button", { name: "이전 달" }));
    }
    await userEvent.click(within(sheet).getByRole("button", { name: dayName }));

    expect(screen.getByTestId("location")).toHaveTextContent(`/planner?userId=7&date=${picked}`);
    expect(vi.mocked(trackPlannerDateChanged)).toHaveBeenLastCalledWith({
      delta: -2,
      method: "picker",
    });
  });

  describe("스택 없이 열린 플래너의 뒤로 가기 — 딥링크, 또는 셸이 웹뷰를 다시 띄워 복원한 문서", () => {
    it("들어온 곳과 상관없이 기록 탭으로 가고, 날짜를 넘긴 뒤에도 셸 쿼리만 들고 간다", async () => {
      renderPlanner(`?guestAuth=1&from=home`);
      await screen.findByTestId("planner-page");

      fireEvent.click(screen.getByRole("button", { name: "전날" }));
      await waitFor(() =>
        expect(screen.getByTestId("location")).toHaveTextContent(`date=${YESTERDAY}`),
      );
      fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));

      expect(await screen.findByText("기록 탭")).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent("/records?guestAuth=1");
      expect(vi.mocked(trackPlannerOpened)).toHaveBeenCalledWith({ via: "unknown", isToday: true });
    });

    it("어디서 왔는지 모르거나 기록 탭에서 왔으면 기록 탭으로 간다", async () => {
      renderPlanner("?guestAuth=1&from=elsewhere");
      await screen.findByTestId("planner-page");

      fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));

      expect(await screen.findByText("기록 탭")).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent("/records?guestAuth=1");
    });
  });

  it("D-Day가 설정돼 있으면 머리 왼쪽에 일수와 제목을 두 줄로 보여주고, 없으면 생략한다", async () => {
    mockedDday.mockResolvedValue({ title: "수능", targetDate: addDaysToDateKey(YESTERDAY, 10) });

    renderPlanner(`?userId=7&date=${YESTERDAY}`);

    // 일수는 플래너 날짜 기준으로 센다. 큰 `D-10` 아래 작은 제목이다.
    const label = await screen.findByText("D-10");
    expect(label.nextElementSibling).toHaveTextContent("수능");
  });

  it("날짜와 전날·다음 날 꺾쇠는 상단 바 가운데 제목이다", async () => {
    renderPlanner(`?userId=7&date=${YESTERDAY}`);

    // 요일은 한 글자다(`9월 18일 금`).
    const label = await screen.findByRole("button", {
      name: dayTitleWithWeekday(YESTERDAY, true),
    });
    expect(label).not.toHaveTextContent("요일");
    // 날짜는 이 화면의 제목이고, 누르면 날짜 선택 시트가 열린다.
    expect(screen.getByRole("heading", { level: 1 })).toContainElement(label);
    expect(label).toHaveAttribute("aria-haspopup", "dialog");
    const bar = screen.getByRole("button", { name: "뒤로 가기" }).parentElement!;
    expect(bar).toContainElement(label);
    expect(bar).toContainElement(screen.getByRole("button", { name: "전날" }));
    expect(bar).toContainElement(screen.getByRole("button", { name: "다음 날" }));
  });

  describe("앱 모드", () => {
    afterEach(() => {
      cleanup();
      resetGlassChrome();
    });

    it("앱에는 뒤로 버튼만 맡기고 날짜 이동 줄은 웹이 그대로 그린다", async () => {
      const postMessage = enterGlassChrome("/planner");
      renderPlanner(`?userId=7&date=${YESTERDAY}`);
      await screen.findByRole("heading", { name: "영어" });

      expect(screen.queryByRole("button", { name: "뒤로 가기" })).not.toBeInTheDocument();
      const sent = postMessage.mock.calls
        .map(([raw]) => JSON.parse(raw as string) as { type: string; top?: unknown })
        .filter((message) => message.type === "set-glass-chrome");
      expect(sent.at(-1)?.top).toEqual({ leading: "back", leadingLabel: "뒤로 가기", title: null });

      const label = screen.getByRole("button", { name: dayTitleWithWeekday(YESTERDAY, true) });
      expect(screen.getByRole("heading", { level: 1 })).toContainElement(label);
      expect(label).toHaveAttribute("aria-haspopup", "dialog");

      await userEvent.click(screen.getByRole("button", { name: "전날" }));
      expect(screen.getByTestId("location")).toHaveTextContent(
        `date=${addDaysToDateKey(YESTERDAY, -1)}`,
      );
      await userEvent.click(screen.getByRole("button", { name: "다음 날" }));
      expect(screen.getByTestId("location")).toHaveTextContent(`date=${YESTERDAY}`);
      expect(vi.mocked(trackPlannerDateChanged)).toHaveBeenLastCalledWith({
        delta: 1,
        method: "button",
      });

      await userEvent.click(label);
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });

    it("앱의 뒤로 가기 누름으로 기록 탭으로 돌아간다", async () => {
      enterGlassChrome("/planner");
      renderPlanner(`?guestAuth=1&date=${YESTERDAY}&from=records`);
      await screen.findByTestId("planner-page");

      pressNative("chrome:leading", 0);

      expect(await screen.findByText("기록 탭")).toBeInTheDocument();
    });
  });

  it("기록이 없는 지난 날은 안내 문구 없이 빈 타임테이블만 보여준다", async () => {
    renderPlanner(`?userId=7&date=${addDaysToDateKey(YESTERDAY, -3)}`);

    await screen.findByRole("img", { name: /시간대별 공부 분포/ });
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByText("이 날은 기록이 없어요")).not.toBeInTheDocument();
    expect(screen.queryByText(/^D-/)).not.toBeInTheDocument();
  });

  it("새벽 0~5시에는 홈과 같이 전날을 오늘로 연다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T03:00:00+09:00"));
    try {
      renderPlanner("?userId=7");

      expect(await screen.findByRole("button", { name: /10월 4일/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "다음 날" })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["10-05", "2020-13-45", "2025-02-30"])(
    "형식이 틀리거나 달력에 없는 날짜(%s)로 열면 오늘 플래너를 연다",
    async (date) => {
      renderPlanner(`?userId=7&date=${date}`);

      await waitFor(() => expect(mockedStats).toHaveBeenCalledWith(TODAY));
      expect(mockedStats).not.toHaveBeenCalledWith(date);
    },
  );

  it("과목별 할 일을 싣지 않는 서버여도 과목별 시간과 타임테이블은 그린다", async () => {
    mockedStats.mockImplementation((date) =>
      Promise.resolve(date === YESTERDAY ? stats([studiedYesterday()]) : stats()),
    );
    renderPlanner(`?userId=7&date=${YESTERDAY}`);

    const english = await screen.findByRole("heading", { name: "영어" });
    expect(english.closest("section")).toHaveTextContent("50분");
    expect(screen.queryByText("단어 60개 암기")).not.toBeInTheDocument();
    expect(screen.queryByText("타임테이블을 불러오지 못했어요")).not.toBeInTheDocument();
  });

  it("조회가 실패하면 오류 문구와 다시 시도를 보여준다", async () => {
    mockedStats.mockRejectedValue(new Error("network"));

    renderPlanner(`?userId=7&date=${YESTERDAY}`);

    expect(await screen.findByText("타임테이블을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });
});
