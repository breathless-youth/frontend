import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  StudySessionListResponse,
  StudySessionSummary,
  SubjectResponse,
} from "@focusmakers/types";

import { addDaysToDateKey, kstDateKey } from "@/features/records/recordsFormat";
import { LONG_PRESS_MS } from "@/features/study-session/subjectInteractions";
import {
  trackPlannerDateChanged,
  trackPlannerOpened,
  trackSubjectItemAdded,
} from "@/lib/amplitude";
import { getDday } from "@/lib/ddayApi";
import { listStudySessionStats } from "@/lib/statsApi";
import {
  createSubject,
  createTask,
  deleteSubject,
  deleteTask,
  listSubjects,
  renameSubject,
  reorderSubjects,
  updateTask,
} from "@/lib/subjectApi";
import { showToast } from "@/lib/toast";
import { PlannerPage } from "@/routes/PlannerPage";

vi.mock("@/lib/statsApi", () => ({ listStudySessionStats: vi.fn(), getPeriodStats: vi.fn() }));
vi.mock("@/lib/subjectApi", () => ({
  listSubjects: vi.fn(),
  createSubject: vi.fn(),
  renameSubject: vi.fn(),
  deleteSubject: vi.fn(),
  reorderSubjects: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/lib/ddayApi", () => ({ getDday: vi.fn() }));
vi.mock("@/lib/amplitude", () => ({
  trackPlannerOpened: vi.fn(),
  trackPlannerDateChanged: vi.fn(),
  trackScreenBackPressed: vi.fn(),
  trackErrorRetryPressed: vi.fn(),
  trackSubjectItemAdded: vi.fn(),
}));

// jsdom에는 `PointerEvent` 구현이 없다 — 스와이프·길게 누르기 판정에 쓰는 좌표와 `isPrimary`를 채운다.
class TestPointerEvent extends MouseEvent {
  readonly isPrimary = true;
  readonly pointerId = 1;
  readonly pointerType = "touch";
}
window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;

const mockedStats = vi.mocked(listStudySessionStats);
const mockedSubjects = vi.mocked(listSubjects);
const mockedDday = vi.mocked(getDday);

const TODAY = kstDateKey();
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
          <Route path="/home" element={<p>홈 탭</p>} />
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
    // 과목 없이 공부한 1시간은 `과목 없음` 행으로 따로 보이고, 범례에도 같은 이름이 있다.
    expect(screen.getByRole("heading", { name: "과목 없음" }).closest("section")).toHaveTextContent(
      "1시간",
    );
    expect(screen.getAllByText("과목 없음")).toHaveLength(2);

    const head = screen.getByText("순공시간").parentElement!;
    expect(within(head).getByText("1시간 50분")).toBeInTheDocument();
    expect(head).toHaveTextContent("총 2시간");
    expect(vi.mocked(trackPlannerOpened)).toHaveBeenCalledWith({ via: "records", isToday: false });
    // 지난 날에도 과목 목록을 조회한다 — 그날 공부하지 않은 과목을 0분으로 보여 주려고.
    expect(mockedSubjects).toHaveBeenCalled();
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

  it("오늘 플래너는 과목 목록을 전부 보여주고, 할 일을 고칠 수 있다", async () => {
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
    expect(screen.getByRole("checkbox", { name: "리스닝 모의고사 1회" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "할 일 추가" })).toBeInTheDocument();
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

  it("날짜를 누르면 날짜 선택 시트가 열리고, 고른 날의 플래너로 옮긴다", async () => {
    renderPlanner(`?userId=7&date=${YESTERDAY}`);
    await screen.findByRole("heading", { name: "영어" });
    const picked = addDaysToDateKey(YESTERDAY, -2);
    const [, pickedMonth, pickedDay] = picked.split("-").map(Number);

    await userEvent.click(screen.getByRole("button", { name: /^\d+월 \d+일 .요일$/ }));
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
    it("홈에서 들어온 플래너는 홈으로 돌아간다 — 홈 탭 웹뷰에 기록 화면을 띄우지 않는다", async () => {
      renderPlanner(`?guestAuth=1&date=${YESTERDAY}&from=home`);
      await screen.findByTestId("planner-page");

      fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));

      expect(await screen.findByText("홈 탭")).toBeInTheDocument();
      // 플래너 전용 쿼리는 떼고 셸이 붙인 쿼리만 들고 간다.
      expect(screen.getByTestId("location")).toHaveTextContent("/home?guestAuth=1");
      expect(vi.mocked(trackPlannerOpened)).toHaveBeenCalledWith({ via: "home", isToday: false });
    });

    it("어디서 왔는지 모르거나 기록 탭에서 왔으면 기록 탭으로 간다", async () => {
      renderPlanner("?guestAuth=1&from=elsewhere");
      await screen.findByTestId("planner-page");

      fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));

      expect(await screen.findByText("기록 탭")).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent("/records?guestAuth=1");
    });
  });

  it("D-Day가 설정돼 있으면 날짜 아래에 보여주고, 없으면 그 줄을 생략한다", async () => {
    mockedDday.mockResolvedValue({ title: "수능", targetDate: addDaysToDateKey(YESTERDAY, 10) });

    renderPlanner(`?userId=7&date=${YESTERDAY}`);

    // 일수는 플래너 날짜 기준으로 세고, 제목과 한 줄에 적는다.
    expect(await screen.findByText("D-10 · 수능")).toBeInTheDocument();
  });

  it("기록이 없는 지난 날은 안내 문구 없이 과목과 과목 추가만 보여준다", async () => {
    mockedSubjects.mockResolvedValue([
      { id: 3, name: "영어", colorIndex: 7, studySec: 0, focusSec: 0, tasks: [] },
    ]);
    renderPlanner(`?userId=7&date=${addDaysToDateKey(YESTERDAY, -3)}`);

    const english = await screen.findByRole("heading", { name: "영어" });
    expect(english.closest("section")).toHaveTextContent(/^영어0분$/);
    expect(screen.getByRole("button", { name: "과목 추가" })).toBeInTheDocument();
    expect(screen.queryByText("이 날은 기록이 없어요")).not.toBeInTheDocument();
    expect(screen.queryByText(/^D-/)).not.toBeInTheDocument();
  });

  it("새벽 0~5시에도 달력의 오늘 플래너를 연다 — 05시 기준은 한 장에 담는 구간에만 쓴다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T03:00:00+09:00"));
    try {
      // 날짜 없이 열면 오늘 플래너다 — 05시 전에도 전날이 아니라 달력의 오늘이다.
      renderPlanner("?userId=7");

      expect(await screen.findByRole("button", { name: /10월 5일/ })).toBeInTheDocument();
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

  it("미래 날짜의 플래너는 기록을 조회하지 않고, 지금 미완료인 할 일을 고칠 수 없는 채로 보여준다", async () => {
    mockedSubjects.mockResolvedValue([
      {
        id: 3,
        name: "영어",
        colorIndex: 7,
        studySec: 0,
        focusSec: 0,
        tasks: [
          { id: 21, name: "리스닝 모의고사 1회", doneAt: null },
          { id: 22, name: "오늘 끝낸 단어", doneAt: new Date().toISOString() },
        ],
      },
    ]);
    const future = addDaysToDateKey(TODAY, 5);
    renderPlanner(`?userId=7&date=${future}`);

    expect(await screen.findByText("리스닝 모의고사 1회")).toBeInTheDocument();
    expect(screen.queryByText("오늘 끝낸 단어")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "할 일 추가" })).not.toBeInTheDocument();
    // 과목은 날짜와 무관한 목록이라 미래 날짜에서도 고친다.
    expect(screen.getByRole("button", { name: "과목 추가" })).toBeInTheDocument();
    expect(mockedStats).not.toHaveBeenCalled();

    // 다음 날로 더 넘어갈 수 있다.
    fireEvent.click(screen.getByRole("button", { name: "다음 날" }));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        `date=${addDaysToDateKey(future, 1)}`,
      ),
    );
  });

  it("조회가 실패하면 오류 문구와 다시 시도를 보여준다", async () => {
    mockedStats.mockRejectedValue(new Error("network"));

    renderPlanner(`?userId=7&date=${YESTERDAY}`);

    expect(await screen.findByText("플래너를 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });
});

const english: SubjectResponse = {
  id: 3,
  name: "영어",
  colorIndex: 7,
  studySec: 0,
  focusSec: 0,
  tasks: [{ id: 21, name: "리스닝 모의고사 1회", doneAt: null }],
};
const math: SubjectResponse = {
  id: 5,
  name: "수학",
  colorIndex: 2,
  studySec: 0,
  focusSec: 0,
  tasks: [],
};

/** 길게 누르기가 발화할 때까지 기다린다. */
async function hold(element: HTMLElement) {
  fireEvent.pointerDown(element, { clientX: 40, clientY: 100 });
  await act(() => new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 40)));
}

describe("PlannerPage — 과목·할 일 관리", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedStats.mockResolvedValue(stats());
    mockedSubjects.mockResolvedValue([english, math]);
    mockedDday.mockResolvedValue(null);
  });

  it("할 일 추가를 누르면 그 자리에 입력이 열리고, 완료로 만든 할 일이 과목 아래에 보인다", async () => {
    vi.mocked(createTask).mockResolvedValue({ id: 22, name: "리딩 지문 2개", doneAt: null });
    renderPlanner("?userId=7");
    const section = (await screen.findByRole("heading", { name: "영어" })).closest("section")!;

    await userEvent.click(within(section).getByRole("button", { name: "할 일 추가" }));
    await userEvent.type(screen.getByRole("textbox", { name: "새 할 일 이름" }), "리딩 지문 2개");
    await userEvent.click(screen.getByRole("button", { name: "완료" }));

    expect(createTask).toHaveBeenCalledWith(3, { name: "리딩 지문 2개" });
    expect(await screen.findByRole("checkbox", { name: "리딩 지문 2개" })).toBeInTheDocument();
    expect(vi.mocked(trackSubjectItemAdded)).toHaveBeenCalledWith("task", false, "planner");
  });

  it("할 일을 탭하면 완료로 바뀐다", async () => {
    vi.mocked(updateTask).mockResolvedValue({
      id: 21,
      name: "리스닝 모의고사 1회",
      doneAt: "2026-10-04T03:00:00Z",
    });
    renderPlanner("?userId=7");

    await userEvent.click(await screen.findByRole("checkbox", { name: "리스닝 모의고사 1회" }));

    expect(updateTask).toHaveBeenCalledWith(3, 21, { done: true });
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "리스닝 모의고사 1회" })).toBeChecked(),
    );
  });

  it("할 일을 왼쪽으로 밀어도 지워지거나 체크되지 않고, 다음 날로 넘어간다", async () => {
    renderPlanner("?userId=7");
    const row = await screen.findByRole("checkbox", { name: "리스닝 모의고사 1회" });

    fireEvent.pointerDown(row, { clientX: 150, clientY: 100 });
    fireEvent.pointerMove(row, { clientX: 30, clientY: 102 });
    fireEvent.pointerUp(row, { clientX: 30, clientY: 102 });
    fireEvent.click(row);

    expect(deleteTask).not.toHaveBeenCalled();
    expect(updateTask).not.toHaveBeenCalled();
    expect(vi.mocked(trackPlannerDateChanged)).toHaveBeenCalledWith({ delta: 1, method: "swipe" });
  });

  it("과목을 길게 누르면 메뉴가 뜨고, 이름 변경은 그 자리의 입력으로 한다", async () => {
    vi.mocked(renameSubject).mockResolvedValue({ ...english, name: "영어 독해" });
    renderPlanner("?userId=7");
    const head = (await screen.findByRole("heading", { name: "영어" })).closest(
      '[role="button"]',
    ) as HTMLElement;

    await hold(head);
    fireEvent.pointerUp(head, { clientX: 40, clientY: 100 });
    await userEvent.click(screen.getByRole("menuitem", { name: "이름 변경" }));
    const input = screen.getByRole("textbox", { name: "과목 이름" });
    await userEvent.clear(input);
    await userEvent.type(input, "영어 독해{Enter}");

    expect(renameSubject).toHaveBeenCalledWith(3, { name: "영어 독해" });
    expect(await screen.findByRole("heading", { name: "영어 독해" })).toBeInTheDocument();
  });

  it("메뉴의 삭제는 과목을 목록에서 뺀다", async () => {
    vi.mocked(deleteSubject).mockResolvedValue(undefined);
    renderPlanner("?userId=7");
    const head = (await screen.findByRole("heading", { name: "수학" })).closest(
      '[role="button"]',
    ) as HTMLElement;

    // 키보드로도 메뉴를 연다.
    head.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.click(screen.getByRole("menuitem", { name: "삭제" }));

    expect(deleteSubject).toHaveBeenCalledWith(5);
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "수학" })).not.toBeInTheDocument(),
    );
  });

  it("길게 누른 채 다른 과목 위로 끌면 순서가 바뀌고, 놓을 때 한 번 저장한다", async () => {
    vi.mocked(reorderSubjects).mockResolvedValue([math, english]);
    renderPlanner("?userId=7");
    const head = (await screen.findByRole("heading", { name: "영어" })).closest(
      '[role="button"]',
    ) as HTMLElement;
    const mathSection = screen.getByRole("heading", { name: "수학" }).closest("section")!;
    document.elementFromPoint = vi.fn(() => mathSection);

    await hold(head);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.pointerMove(head, { clientX: 40, clientY: 160 });
    // 끌기 시작하면 메뉴는 닫힌다.
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.pointerUp(head, { clientX: 40, clientY: 160 });

    expect(reorderSubjects).toHaveBeenCalledWith({ subjectIds: [5, 3] });
    expect(screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent)).toEqual([
      "수학",
      "영어",
    ]);
    expect(vi.mocked(trackPlannerDateChanged)).not.toHaveBeenCalled();
  });

  it("과목 추가로 만든 과목이 목록 끝에 붙는다", async () => {
    vi.mocked(createSubject).mockResolvedValue({ ...math, id: 9, name: "한국사" });
    renderPlanner("?userId=7");
    await screen.findByRole("heading", { name: "영어" });

    await userEvent.click(screen.getByRole("button", { name: "과목 추가" }));
    await userEvent.type(screen.getByRole("textbox", { name: "새 과목 이름" }), "한국사{Enter}");

    expect(createSubject).toHaveBeenCalledWith({ name: "한국사" });
    expect(await screen.findByRole("heading", { name: "한국사" })).toBeInTheDocument();
    expect(vi.mocked(trackSubjectItemAdded)).toHaveBeenCalledWith("subject", false, "planner");
  });

  it("과목이 없으면 자주 쓰는 과목을 흐린 줄로 보여주고, 줄의 추가 한 번으로 과목을 만든다", async () => {
    mockedSubjects.mockResolvedValue([]);
    vi.mocked(createSubject).mockResolvedValue({ ...math, id: 9, name: "국어" });
    renderPlanner("?userId=7");

    const suggestions = await screen.findByRole("list", { name: "추천 과목" });
    expect(within(suggestions).getAllByRole("button", { name: / 추가$/ })).toHaveLength(4);
    expect(screen.queryByText("아직 과목이 없어요")).not.toBeInTheDocument();
    await userEvent.click(within(suggestions).getByRole("button", { name: "국어 추가" }));

    expect(createSubject).toHaveBeenCalledWith({ name: "국어" });
    expect(await screen.findByRole("heading", { name: "국어" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "추천 과목" })).not.toBeInTheDocument();
    expect(vi.mocked(trackSubjectItemAdded)).toHaveBeenCalledWith("subject", true, "planner");
  });

  it("과목이 없어도 지난 날에는 흐린 추천 과목을 보여주지 않는다 — 과목 추가만 남는다", async () => {
    mockedSubjects.mockResolvedValue([]);
    renderPlanner(`?userId=7&date=${YESTERDAY}`);

    expect(await screen.findByRole("button", { name: "과목 추가" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "추천 과목" })).not.toBeInTheDocument();
  });

  it("지난 날 플래너는 과목만 고칠 수 있다 — 지금의 과목을 전부 보여주되 할 일은 그날 완료한 것만 남긴다", async () => {
    mockedStats.mockImplementation((date) =>
      Promise.resolve(date === YESTERDAY ? stats([studiedYesterday()]) : stats()),
    );
    renderPlanner(`?userId=7&date=${YESTERDAY}`);

    // 그날 공부하지 않은 과목도 0분으로 보인다.
    const mathHeading = await screen.findByRole("heading", { name: "수학" });
    expect(mathHeading.closest("section")).toHaveTextContent(/^수학0분$/);
    const englishSection = screen.getByRole("heading", { name: "영어" }).closest("section")!;
    expect(englishSection).toHaveTextContent("50분");
    expect(within(englishSection).getByText("단어 60개 암기")).toBeInTheDocument();
    // 할 일에는 날짜가 없어 지금 목록의 미완료 할 일은 지난 날에 보여 주지 않는다.
    expect(screen.queryByText("리스닝 모의고사 1회")).not.toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "할 일 추가" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    // 과목은 지난 날에서도 추가한다.
    vi.mocked(createSubject).mockResolvedValue({ ...math, id: 9, name: "한국사" });
    await userEvent.click(screen.getByRole("button", { name: "과목 추가" }));
    await userEvent.type(screen.getByRole("textbox", { name: "새 과목 이름" }), "한국사{Enter}");
    expect(createSubject).toHaveBeenCalledWith({ name: "한국사" });
    expect(await screen.findByRole("heading", { name: "한국사" })).toBeInTheDocument();
  });

  it("과목 목록을 못 받으면 알리고 다시 시도할 수 있다", async () => {
    mockedSubjects.mockRejectedValueOnce(new Error("network"));
    renderPlanner("?userId=7");

    await userEvent.click(await screen.findByRole("button", { name: "다시 시도" }));

    expect(vi.mocked(showToast)).toHaveBeenCalledWith("과목을 불러오지 못했어요");
    expect(await screen.findByRole("heading", { name: "영어" })).toBeInTheDocument();
  });
});
