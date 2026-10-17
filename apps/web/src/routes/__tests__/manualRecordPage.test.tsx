import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  StudySessionListResponse,
  StudySessionResponse,
  StudySessionSummary,
  SubjectResponse,
} from "@focusmakers/types";

import { dayTitleWithWeekday } from "@/features/records/recordsFormat";
import { trackManualRecordAdd } from "@/lib/amplitude";
import { createManualRecord, updateManualRecord } from "@/lib/manualRecordApi";
import { listStudySessionStats } from "@/lib/statsApi";
import { listSubjects } from "@/lib/subjectApi";
import type * as UserIdModule from "@/lib/userId";
import { ManualRecordPage } from "@/routes/ManualRecordPage";

vi.mock("@/lib/statsApi", () => ({ listStudySessionStats: vi.fn(), getPeriodStats: vi.fn() }));
vi.mock("@/lib/subjectApi", () => ({ listSubjects: vi.fn() }));
vi.mock("@/lib/manualRecordApi", () => ({
  createManualRecord: vi.fn(),
  updateManualRecord: vi.fn(),
  deleteManualRecord: vi.fn(),
}));
vi.mock("@/lib/amplitude", () => ({
  trackScreenBackPressed: vi.fn(),
  trackErrorRetryPressed: vi.fn(),
  trackManualRecordAdd: vi.fn(),
  trackManualRecordEdit: vi.fn(),
  trackManualRecordDelete: vi.fn(),
  trackManualRecordOverlapBlocked: vi.fn(),
}));

// 토큰 문서 여부만 바꾼다. 신원은 그대로 `?userId=`에서 읽는다.
const tokenMock = vi.hoisted(() => ({ has: true }));
vi.mock("@/lib/userId", async (importOriginal) => ({
  ...(await importOriginal<typeof UserIdModule>()),
  hasTokenSource: () => tokenMock.has,
}));

const mockedStats = vi.mocked(listStudySessionStats);

/** 이미 지난 화요일과 그 앞뒤. 시계에 의존하는 오늘 기본값은 순수 모듈 테스트가 본다. */
const DAY = "2025-03-04";
const PREV = "2025-03-03";
const NEXT = "2025-03-05";
const AFTER_NEXT = "2025-03-06";
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
    subjects: [{ id: 3, name: "국어", colorIndex: 1, deleted: false }],
  };
}

function piece(
  id: number,
  startedAt: string,
  endedAt: string,
  over: Partial<StudySessionSummary> = {},
): StudySessionSummary {
  const sec = (Date.parse(endedAt) - Date.parse(startedAt)) / 1000;
  return {
    id,
    statDate: DAY,
    startedAt,
    endedAt,
    studySec: sec,
    focusSec: sec,
    focusRate: 100,
    eventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, SLEEP: 0, PAUSE: 0 },
    events: [],
    subjectSegments: [],
    ...over,
  };
}

/** 같은 묶음 키를 가진 수동 조각. */
const manual = (id: number, startedAt: string, endedAt: string, key: string) =>
  piece(id, startedAt, endedAt, { source: "MANUAL", submissionStartedAt: key });

const KOREAN: SubjectResponse = {
  id: 3,
  name: "국어",
  colorIndex: 1,
  studySec: 0,
  focusSec: 0,
  tasks: [],
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

/** 기록 탭 → 홈 탭 → 입력 화면 순서로 쌓인 메모리 스택. 스택이 있다고 볼지는 `withStack()`이 정한다. */
function renderPage(search: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={["/records?userId=7", "/home?userId=7", `/manual-record${search}`]}
        initialIndex={2}
      >
        <Routes>
          <Route path="/manual-record" element={<ManualRecordPage />} />
          <Route path="/records" element={<p>기록 탭</p>} />
          <Route path="/home" element={<p>홈 탭</p>} />
          <Route path="/planner" element={<p>플래너</p>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** 앱 안에서 이동해 온 화면처럼 BrowserRouter가 심는 스택 위치를 흉내 낸다. MemoryRouter는 이 값을 쓰지 않는다. */
function withStack() {
  window.history.replaceState({ idx: 2 }, "");
}

describe("ManualRecordPage", () => {
  beforeEach(() => {
    tokenMock.has = true;
    vi.clearAllMocks();
    mockedStats.mockResolvedValue(stats());
    vi.mocked(listSubjects).mockResolvedValue([KOREAN]);
  });

  afterEach(() => {
    window.history.replaceState(null, "");
  });

  it("추가 화면은 제목과 날짜를 보여 주고 날짜에 포커스하며, 그날과 다음 날을 받아 그날 마지막 기록 뒤로 채운다", async () => {
    mockedStats.mockImplementation((date) =>
      Promise.resolve(date === DAY ? stats([piece(1, kst(DAY, 9), kst(DAY, 10, 30))]) : stats()),
    );
    renderPage(`?userId=7&date=${DAY}&entry=records`);

    expect(screen.getByRole("heading", { name: "시간 직접 입력" })).toBeInTheDocument();
    const date = await screen.findByText(dayTitleWithWeekday(DAY));
    await waitFor(() => expect(date).toHaveFocus());
    expect(mockedStats).toHaveBeenCalledWith(DAY);
    expect(mockedStats).toHaveBeenCalledWith(NEXT);
    expect(screen.getByLabelText("시작")).toHaveValue("10:30");
    expect(screen.getByLabelText("종료")).toHaveValue("11:30");
    expect(await screen.findByRole("button", { name: "국어" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
  });

  it("칸에서 연 추가는 칸 시각부터 채운다", async () => {
    renderPage(`?userId=7&date=${DAY}&entry=planner_cell&start=${Date.parse(kst(DAY, 12))}`);

    expect(await screen.findByLabelText("시작")).toHaveValue("12:00");
    expect(screen.getByLabelText("종료")).toHaveValue("13:00");
  });

  it("다음 날 조회가 실패해도 추가 화면은 연다", async () => {
    mockedStats.mockImplementation((date) =>
      date === NEXT ? Promise.reject(new Error("network")) : Promise.resolve(stats()),
    );
    renderPage(`?userId=7&date=${DAY}&entry=records`);

    expect(await screen.findByLabelText("시작")).toHaveValue("09:00");
  });

  it("그날 조회가 실패하면 다시 시도를 보여 주고, 다시 받으면 폼을 연다", async () => {
    let fail = true;
    mockedStats.mockImplementation((date) =>
      date === DAY && fail ? Promise.reject(new Error("network")) : Promise.resolve(stats()),
    );
    renderPage(`?userId=7&date=${DAY}&entry=records`);

    expect(await screen.findByText("기록을 불러오지 못했어요")).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByLabelText("시작")).toBeInTheDocument();
  });

  it("과목 목록을 받는 동안은 폼 대신 자리표시를 보여 주고, 받으면 과목 칩과 함께 폼을 연다", async () => {
    let resolveSubjects!: (subjects: SubjectResponse[]) => void;
    vi.mocked(listSubjects).mockReturnValue(
      new Promise((resolve) => {
        resolveSubjects = resolve;
      }),
    );
    renderPage(`?userId=7&date=${DAY}&entry=records`);

    // 이틀 조회가 끝나 폼이 뜰 수 있는 때를 지나서 봐야 과목 목록이 폼을 막는지 알 수 있다.
    await waitFor(() => expect(mockedStats).toHaveBeenCalledWith(NEXT));
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
    expect(screen.getAllByRole("status", { name: "불러오는 중" }).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("시작")).not.toBeInTheDocument();

    resolveSubjects([KOREAN]);
    expect(await screen.findByLabelText("시작")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "국어" })).toBeInTheDocument();
  });

  it("과목 목록 조회가 실패하면 다시 시도를 보여 주고, 다시 받으면 과목 칩과 함께 폼을 연다", async () => {
    vi.mocked(listSubjects).mockRejectedValueOnce(new Error("network")).mockResolvedValue([KOREAN]);
    renderPage(`?userId=7&date=${DAY}&entry=records`);

    expect(await screen.findByText("기록을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.queryByLabelText("시작")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByLabelText("시작")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "국어" })).toBeInTheDocument();
    expect(vi.mocked(listSubjects)).toHaveBeenCalledTimes(2);
  });

  it("토큰 없는 문서는 안내만 보여 주고 조회하지 않는다", () => {
    tokenMock.has = false;
    renderPage(`?userId=7&date=${DAY}&entry=records`);

    expect(screen.getByText("기기 등록 전이에요. 앱에서 열면 기록이 저장돼요")).toBeInTheDocument();
    expect(screen.queryByLabelText("시작")).not.toBeInTheDocument();
    expect(mockedStats).not.toHaveBeenCalled();
  });

  it("스택 없이 열린 플래너 입구 화면의 뒤로 가기는 그날 플래너로 가고 셸 쿼리를 들고 간다", async () => {
    renderPage(`?userId=7&date=${DAY}&entry=planner_button`);
    await screen.findByLabelText("시작");

    fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));

    expect(await screen.findByText("플래너")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(`/planner?userId=7&date=${DAY}`);
  });

  it("저장 중에 뒤로 가면 저장이 끝나도 한 번 더 돌아가지 않는다", async () => {
    let finish: (pieces: StudySessionResponse[]) => void = () => undefined;
    vi.mocked(createManualRecord).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    withStack();
    renderPage(`?userId=7&date=${DAY}&entry=records`);

    await userEvent.click(await screen.findByRole("button", { name: "저장" }));
    fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(await screen.findByText("홈 탭")).toBeInTheDocument();

    finish([]);
    await waitFor(() => expect(vi.mocked(trackManualRecordAdd)).toHaveBeenCalled());
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/home\?userId=7$/);
  });

  describe("수정", () => {
    // KST 03-03 23:30 ~ 03-04 00:30 한 묶음. 앞 조각은 전날 조회에만 있다.
    const before = manual(8, kst(PREV, 23, 30), kst(DAY, 0), kst(PREV, 23, 30));
    const after = manual(9, kst(DAY, 0), kst(DAY, 0, 30), kst(PREV, 23, 30));

    it("뒤 조각 id로 열면 전날을 받아 묶음 전체로 열고, 저장하면 앞 조각 id로 보내고 이전 화면으로 돌아간다", async () => {
      mockedStats.mockImplementation((date) =>
        Promise.resolve(date === DAY ? stats([after]) : date === PREV ? stats([before]) : stats()),
      );
      vi.mocked(updateManualRecord).mockResolvedValue([]);
      withStack();
      renderPage(`?userId=7&date=${DAY}&entry=records&id=9`);

      expect(screen.getByRole("heading", { name: "기록 수정" })).toBeInTheDocument();
      expect(await screen.findByText(dayTitleWithWeekday(PREV))).toBeInTheDocument();
      expect(mockedStats).toHaveBeenCalledWith(PREV);
      expect(screen.getByLabelText("시작")).toHaveValue("23:30");
      expect(screen.getByLabelText("종료")).toHaveValue("00:30");
      expect(screen.getByText("다음 날")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "저장" }));

      expect(await screen.findByText("홈 탭")).toBeInTheDocument();
      expect(vi.mocked(updateManualRecord)).toHaveBeenCalledWith(8, {
        startedAt: kst(PREV, 23, 30),
        endedAt: kst(DAY, 0, 30),
      });
    });

    it("묶음이 다음 날 자정을 넘기면 그다음 날 조회까지 받아 묶음 끝으로 연다", async () => {
      // KST 03-04 00:00부터 03-06 01:00까지 한 묶음. 뒤 조각은 날짜마다 그날 조회에만 있다.
      const key = kst(DAY, 0);
      const first = manual(8, kst(DAY, 0), kst(NEXT, 0), key);
      const second = manual(9, kst(NEXT, 0), kst(AFTER_NEXT, 0), key);
      const third = manual(10, kst(AFTER_NEXT, 0), kst(AFTER_NEXT, 1), key);
      mockedStats.mockImplementation((date) =>
        Promise.resolve(
          date === DAY
            ? stats([first])
            : date === NEXT
              ? stats([second])
              : date === AFTER_NEXT
                ? stats([third])
                : stats(),
        ),
      );
      renderPage(`?userId=7&date=${DAY}&entry=records&id=8`);

      expect(await screen.findByLabelText("시작")).toHaveValue("00:00");
      expect(mockedStats).toHaveBeenCalledWith(AFTER_NEXT);
      expect(screen.getByLabelText("종료")).toHaveValue("01:00");
    });

    it("받아야 할 이웃 날 조회가 실패하면 폼 대신 다시 시도를 보여 준다", async () => {
      // 묶음이 전날에 시작해 전날 조회가 필요한데 그 조회가 실패한다. 조각이 빠진 채 저장하면 기록이 줄어든다.
      mockedStats.mockImplementation((date) =>
        date === PREV
          ? Promise.reject(new Error("network"))
          : Promise.resolve(date === DAY ? stats([after]) : stats()),
      );
      renderPage(`?userId=7&date=${DAY}&entry=records&id=9`);

      expect(await screen.findByText("기록을 불러오지 못했어요")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
      expect(mockedStats).toHaveBeenCalledWith(PREV);
      expect(screen.queryByLabelText("시작")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
    });

    it("측정 기록 id로 열리면 스택이 없을 때 들어온 탭의 같은 날로 돌아가고 셸 쿼리를 남긴다", async () => {
      mockedStats.mockImplementation((date) =>
        Promise.resolve(date === DAY ? stats([piece(1, kst(DAY, 9), kst(DAY, 10))]) : stats()),
      );
      renderPage(`?userId=7&date=${DAY}&entry=records&id=1`);

      expect(await screen.findByText("기록 탭")).toBeInTheDocument();
      expect(screen.getByTestId("location")).toHaveTextContent(
        new RegExp(`^/records\\?userId=7&date=${DAY}$`),
      );
    });

    it("묶음 키가 없는 수동 기록은 수정 화면을 열지 않고 이전 화면으로 돌아간다", async () => {
      // 키가 없으면 겹침으로 잘린 다른 조각을 찾을 수 없다. 조각 하나로 저장하면 서버가 묶음 전체를 바꿔 나머지가 사라진다.
      withStack();
      mockedStats.mockImplementation((date) =>
        Promise.resolve(
          date === DAY
            ? stats([piece(1, kst(DAY, 9), kst(DAY, 10), { source: "MANUAL" })])
            : stats(),
        ),
      );
      renderPage(`?userId=7&date=${DAY}&entry=planner_cell&id=1`);

      expect(await screen.findByText("홈 탭")).toBeInTheDocument();
    });

    it("없는 id로 열리면 이전 화면으로 돌아간다", async () => {
      withStack();
      renderPage(`?userId=7&date=${DAY}&entry=planner_cell&id=99`);

      expect(await screen.findByText("홈 탭")).toBeInTheDocument();
    });
  });
});
