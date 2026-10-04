import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  StudyPeriodStatsResponse,
  StudySessionListResponse,
  StudySessionSummary,
} from "@focusmakers/types";
import {
  kstDateKey,
  monthLabel,
  monthOfDateKey,
  shiftMonth,
} from "@/features/records/recordsFormat";
import { getPeriodStats, listStudySessionStats } from "@/lib/statsApi";
import {
  trackRecordsMonthChanged,
  trackRecordsPeriodPicked,
  trackRecordsPeriodPickerOpened,
  trackRecordsSessionExpanded,
  trackRecordsViewChanged,
  trackRecordsWeekChanged,
} from "@/lib/amplitude";
import { RecordsPage } from "@/routes/RecordsPage";

/**
 * (모바일판 `__tests__/records.test.tsx`에서 케이스 이식 — BY-330, v2 조립으로 갱신 — BY-567 Task 8.
 * RN판은 fake timers로 "오늘"을 고정하지만, 웹판은 오늘을 매 렌더 계산으로 바꿨다
 * (`RecordsPage`의 RN판 차이 주석 참고) — 시계를 고정하는 대신 테스트가 `recordsFormat`의
 * 같은 순수 함수로 기대값을 계산한다. 실행 날짜와 무관하게 항상 맞는다.
 *
 * 스트릭 배너·요약 타일·`studiedDatesInMonth`/streak 도트 관련 테스트는 v2에서 걷어낸
 * 기능이라 지웠다 — 대신 세그먼트·선택일 제목·달 합계를 확인한다. `getPeriodStats` 목을
 * 셋업에 더했다(달력 농도·달 합계·하루 평균이 이 조회 하나로 채워진다).
 */

// jsdom에는 `PointerEvent` 구현이 없다 — 달력 스와이프 판정에 쓰는 `clientX`가 사라지지 않게 한다.
if (typeof window.PointerEvent === "undefined") {
  window.PointerEvent = MouseEvent as unknown as typeof PointerEvent;
}
vi.mock("@/lib/statsApi", () => ({
  listStudySessionStats: vi.fn(),
  getPeriodStats: vi.fn(),
}));
vi.mock("@/lib/amplitude", () => ({
  trackRecordsDateSelected: vi.fn(),
  trackRecordsMonthChanged: vi.fn(),
  trackRecordsSessionExpanded: vi.fn(),
  trackRecordsViewChanged: vi.fn(),
  trackRecordsWeekChanged: vi.fn(),
  trackRecordsPeriodPickerOpened: vi.fn(),
  trackRecordsPeriodPicked: vi.fn(),
  trackErrorRetryPressed: vi.fn(),
}));

const mockedStats = vi.mocked(listStudySessionStats);
const mockedPeriod = vi.mocked(getPeriodStats);
const mockedTrackMonthChanged = vi.mocked(trackRecordsMonthChanged);
const mockedTrackSessionExpanded = vi.mocked(trackRecordsSessionExpanded);

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
            eventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, SLEEP: 0, PAUSE: 0 },
          },
        ]
      : [],
    sessionCount: hasSession ? 1 : 0,
    totalStudySec: hasSession ? 3600 : 0,
    totalFocusSec: hasSession ? 1800 : 0,
    longestFocusSec: hasSession ? 1800 : 0,
    focusRate: hasSession ? 50 : 0,
    totalEventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, SLEEP: 0, PAUSE: 0 },
    studiedDatesInMonth: [],
  };
}

function periodResponse(
  dailyList: StudyPeriodStatsResponse["dailyList"] = [],
  compareDailyList: StudyPeriodStatsResponse["compareDailyList"] = [],
): StudyPeriodStatsResponse {
  return {
    from: "2026-01-01",
    to: "2026-01-31",
    compareFrom: null,
    compareTo: null,
    dailyList,
    compareDailyList,
  };
}

/** 플래너로 넘어갔는지 확인하는 자리표시 라우트 — 어느 날짜로 열었는지 적는다. */
function PlannerRouteProbe() {
  const location = useLocation();
  return <p data-testid="planner-route">{`${location.pathname}${location.search}`}</p>;
}

function renderRecords(path = "/records?userId=7") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/records" element={<RecordsPage />} />
          <Route path="/planner" element={<PlannerRouteProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RecordsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPeriod.mockResolvedValue(periodResponse());
  });

  it("세션 행을 누르면 그 자리에서 펼쳐지고 다시 누르면 접힌다", async () => {
    mockedStats.mockResolvedValue(statsResponse(true));

    renderRecords();

    const row = await screen.findByRole("button", { name: /09:00부터 10:00까지/ });
    expect(row).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("최대 집중 시간")).toBeInTheDocument();
    expect(mockedTrackSessionExpanded).toHaveBeenLastCalledWith({ expanded: true });

    await userEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("최대 집중 시간")).not.toBeInTheDocument();
    expect(mockedTrackSessionExpanded).toHaveBeenLastCalledWith({ expanded: false });
  });

  it("세션 행은 한 번에 하나만 펼쳐진다", async () => {
    const base = statsResponse(true);
    mockedStats.mockResolvedValue({
      ...base,
      sessions: [
        base.sessions[0]!,
        {
          ...base.sessions[0]!,
          id: 2,
          startedAt: "2026-01-01T03:00:00.000Z",
          endedAt: "2026-01-01T04:00:00.000Z",
        },
      ],
      sessionCount: 2,
    });

    renderRecords();

    const morning = await screen.findByRole("button", { name: /09:00부터 10:00까지/ });
    const noon = screen.getByRole("button", { name: /12:00부터 13:00까지/ });

    await userEvent.click(morning);
    await userEvent.click(noon);

    expect(morning).toHaveAttribute("aria-expanded", "false");
    expect(noon).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("최대 집중 시간")).toHaveLength(1);
  });

  it("선택일(기본값 오늘)의 세션 목록을 순공·총 공부시간·집중률이 보이는 행으로 보여준다", async () => {
    mockedStats.mockResolvedValue(statsResponse(true));

    renderRecords();

    // startedAt 2026-01-01T00:00Z / endedAt 2026-01-01T01:00Z → KST 09:00 ~ 10:00.
    const row = await screen.findByRole("button", {
      name: "09:00부터 10:00까지, 순공 30분, 집중 50%",
    });
    expect(row).toHaveTextContent("총 공부시간 1시간");
    expect(row).toHaveTextContent("집중 50%");
    expect(screen.queryByText("이 날은 기록이 없어요")).not.toBeInTheDocument();
  });

  it("선택일에 기록이 없으면 빈 상태 문구를 카드 안에 보여준다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));

    renderRecords();

    expect(await screen.findByText("이 날은 기록이 없어요")).toBeInTheDocument();
  });

  it("일간 세그먼트가 기본으로 눌린 상태이고 주간은 활성이다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));

    renderRecords();

    const daily = await screen.findByRole("tab", { name: "일간" });
    expect(daily).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "주간" })).not.toBeDisabled();
  });

  it("주간 토글을 누르면 주간 뷰가 나오고, 일간으로 돌아오면 일간 뷰가 보인다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));

    renderRecords();

    // 처음엔 일간 뷰(선택일 제목)가 보인다.
    expect(await screen.findByText(/요일$/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "주간" }));

    // 주간 뷰 — 리듬 카드는 데이터와 무관하게 항상 보이고, 일간 제목은 사라진다.
    expect(await screen.findByText("나의 공부 리듬")).toBeInTheDocument();
    expect(screen.queryByText(/요일$/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "일간" }));

    // 일간으로 복귀 — 선택일 제목이 돌아오고 리듬 카드는 사라진다.
    expect(await screen.findByText(/요일$/)).toBeInTheDocument();
    expect(screen.queryByText("나의 공부 리듬")).not.toBeInTheDocument();
  });

  it("일간에서 이전 달로 이동한 뒤 주간을 거쳐 돌아와도 그 달이 유지된다(lift state)", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));

    renderRecords();

    const currentMonth = monthOfDateKey(kstDateKey());
    await screen.findByText(/요일$/);

    await userEvent.click(screen.getByRole("button", { name: "이전 달" }));
    const prevMonth = shiftMonth(currentMonth, -1);
    expect(screen.getByText(monthLabel(prevMonth))).toBeInTheDocument();

    // 주간으로 갔다가 다시 일간으로 — 서브트리 unmount로 오늘 달로 리셋되지 않는다.
    await userEvent.click(screen.getByRole("tab", { name: "주간" }));
    await screen.findByText("나의 공부 리듬");
    await userEvent.click(screen.getByRole("tab", { name: "일간" }));

    expect(screen.getByText(monthLabel(prevMonth))).toBeInTheDocument();
  });

  it("주간에서 이전 주로 이동한 뒤 일간을 거쳐 돌아와도 그 주가 유지된다(lift state)", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));

    renderRecords();

    await userEvent.click(await screen.findByRole("tab", { name: "주간" }));
    const thisWeekLabel = (await screen.findByText(/\d+월 \d+일 ~/)).textContent;

    await userEvent.click(screen.getByRole("button", { name: "이전 주" }));
    const prevWeekLabel = screen.getByText(/\d+월 \d+일 ~/).textContent;
    expect(prevWeekLabel).not.toBe(thisWeekLabel);

    // 일간으로 갔다가 다시 주간으로 — 이번 주로 리셋되지 않고 이동했던 주가 유지된다.
    await userEvent.click(screen.getByRole("tab", { name: "일간" }));
    await screen.findByText(/요일$/);
    await userEvent.click(screen.getByRole("tab", { name: "주간" }));

    expect(screen.getByText(/\d+월 \d+일 ~/).textContent).toBe(prevWeekLabel);
  });

  it("선택일 제목을 요일과 함께 보여준다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));

    renderRecords();

    expect(await screen.findByText(/요일$/)).toBeInTheDocument();
  });

  it("머리는 고른 날의 순공시간과 총 공부시간을 보여주고, 오늘이면 오늘 순공시간이라고 적는다", async () => {
    mockedStats.mockResolvedValue(statsResponse(true));

    renderRecords();

    const headline = (await screen.findByText("오늘 순공시간")).parentElement!;
    expect(await within(headline).findByText("30분")).toBeInTheDocument();
    expect(within(headline).getByText("1시간")).toBeInTheDocument();
    expect(headline).toHaveTextContent("총 공부시간 1시간");
  });

  it("다른 날을 고르면 머리 라벨이 그 날짜로 바뀌고, 달을 옮겨도 고른 날이 유지된다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));

    renderRecords();

    await screen.findByText("오늘 순공시간");
    // 오늘이 1일이어도 고를 수 있게 지난달로 가서 15일을 고른다.
    await userEvent.click(screen.getByRole("button", { name: "이전 달" }));
    const prevMonth = shiftMonth(monthOfDateKey(kstDateKey()), -1);
    await userEvent.click(screen.getByRole("button", { name: "15일, 기록 없음" }));

    const label = `${String(prevMonth.month)}월 15일 순공시간`;
    expect(await screen.findByText(label)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "다음 달" }));
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("달력 아래에 그 달 합계와 공부한 날 기준 하루 평균을 보여준다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));
    const month = monthOfDateKey(kstDateKey());
    mockedPeriod.mockResolvedValue(
      periodResponse([
        { date: "2026-01-01", studySec: 3600, focusSec: 3600 },
        { date: "2026-01-02", studySec: 0, focusSec: 0 },
        { date: "2026-01-03", studySec: 7200, focusSec: 7200 },
      ]),
    );

    renderRecords();

    expect(await screen.findByText(`${String(month.month)}월 합계`)).toBeInTheDocument();
    expect(await screen.findByText("3시간")).toBeInTheDocument();
    expect(screen.getByText("1시간 30분")).toBeInTheDocument();
    expect(screen.getByText("공부한 2일 기준")).toBeInTheDocument();
  });

  it("보는 달에 기록이 하나도 없으면 빈 상태에 다음 행동을 한 줄 더 알려 준다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));

    renderRecords();

    expect(await screen.findByText("이 날은 기록이 없어요")).toBeInTheDocument();
    expect(await screen.findByText("집중을 시작하면 여기에 쌓여요")).toBeInTheDocument();
    expect(screen.getByText("아직 공부한 날이 없어요")).toBeInTheDocument();
  });

  it("달에는 기록이 있고 고른 날만 없으면 빈 상태 한 줄만 보여준다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));
    mockedPeriod.mockResolvedValue(
      periodResponse([{ date: "2026-01-01", studySec: 3600, focusSec: 3600 }]),
    );

    renderRecords();

    expect(await screen.findByText("이 날은 기록이 없어요")).toBeInTheDocument();
    await screen.findByText("공부한 1일 기준");
    expect(screen.queryByText("집중을 시작하면 여기에 쌓여요")).not.toBeInTheDocument();
  });

  it('헤더 이전/다음 달 버튼을 누르면 달이 바뀌고 계측이 { delta, method: "button" }로 나가지만, 선택일은 그대로 유지한다(2026-07-28 확정 정책 + 코덱스 리뷰 반영)', async () => {
    mockedStats.mockResolvedValue(statsResponse(false));

    renderRecords();

    const todayKey = kstDateKey();
    const currentMonth = monthOfDateKey(todayKey);
    await screen.findByText(/요일$/);

    await userEvent.click(screen.getByRole("button", { name: "이전 달" }));
    expect(screen.getByText(monthLabel(shiftMonth(currentMonth, -1)))).toBeInTheDocument();
    expect(screen.getByText(/요일$/)).toBeInTheDocument();
    expect(mockedTrackMonthChanged).toHaveBeenNthCalledWith(1, { delta: -1, method: "button" });

    await userEvent.click(screen.getByRole("button", { name: "다음 달" }));
    expect(screen.getByText(monthLabel(currentMonth))).toBeInTheDocument();
    expect(mockedTrackMonthChanged).toHaveBeenNthCalledWith(2, { delta: 1, method: "button" });
  });

  it("오늘이 속한 달보다 뒤로는 넘어가지 않는다 — 다음 달 버튼은 비활성이고 스와이프도 무시한다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));

    renderRecords();

    const currentLabel = monthLabel(monthOfDateKey(kstDateKey()));
    await screen.findByText(/요일$/);
    expect(screen.getByRole("button", { name: "다음 달" })).toBeDisabled();

    // 왼쪽으로 스와이프(다음 달) — 달도 계측도 그대로다.
    const swipeArea = screen.getByTestId("month-calendar-swipe-area");
    fireEvent.pointerDown(swipeArea, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(swipeArea, { clientX: 240, clientY: 200 });

    expect(screen.getByText(currentLabel)).toBeInTheDocument();
    expect(mockedTrackMonthChanged).not.toHaveBeenCalled();

    // 지난달로 가면 다음 달 버튼이 다시 켜진다.
    await userEvent.click(screen.getByRole("button", { name: "이전 달" }));
    expect(screen.getByRole("button", { name: "다음 달" })).not.toBeDisabled();
  });

  it("일별 기록 조회 실패 시 오류 문구와 다시 시도를 보여주고, 재시도로 복구한다", async () => {
    mockedStats.mockRejectedValueOnce(new Error("network"));

    renderRecords();

    await screen.findByText("기록을 불러오지 못했어요");

    mockedStats.mockResolvedValue(statsResponse(false));
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() => expect(mockedStats).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/요일$/)).toBeInTheDocument();
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
        eventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, SLEEP: 0, PAUSE: 0 },
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
    });

    renderRecords();

    await screen.findByText(/요일$/);
    // 내림차순(최신순 고정) — late(30분) → mid(20분) → early(10분).
    const labels = screen
      .getAllByRole("button", { name: /순공 (10|20|30)분, 집중 50%$/ })
      .map((el) => el.getAttribute("aria-label")?.replace(/^.*, 순공 /, "순공 "));
    expect(labels).toEqual(["순공 30분, 집중 50%", "순공 20분, 집중 50%", "순공 10분, 집중 50%"]);
  });

  it("userId가 없으면 데이터 조회 없이 단독 모드 안내만 보여주고 주간 탭을 막는다", () => {
    renderRecords("/records");

    expect(screen.getByText(/기기 등록 전/)).toBeInTheDocument();
    expect(mockedStats).not.toHaveBeenCalled();
    expect(mockedPeriod).not.toHaveBeenCalled();
    // 기기 미등록이면 주간 데이터를 못 받으므로 주간 탭 비활성(탭·내용 어긋남 방지).
    expect(screen.getByRole("tab", { name: "주간" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "일간" })).not.toBeDisabled();
  });

  it("월을 옮기는 동안 이전 달 합계가 새 달 제목 아래 보이지 않는다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));
    mockedPeriod.mockResolvedValueOnce(
      periodResponse([
        { date: "2026-01-01", studySec: 3600, focusSec: 3600 },
        { date: "2026-01-02", studySec: 1800, focusSec: 1800 },
      ]),
    );

    renderRecords();

    expect(await screen.findByText("1시간 30분")).toBeInTheDocument();

    // 지난달 조회를 붙잡아 둔다 — period는 placeholderData를 쓰지 않으므로 새 조회가 끝날
    // 때까지 pending이고, 화면은 이번 달 합계를 지난달의 성공으로 보여주지 않는다.
    let resolvePrev: ((value: StudyPeriodStatsResponse) => void) | undefined;
    mockedPeriod.mockImplementation(
      () =>
        new Promise<StudyPeriodStatsResponse>((resolve) => {
          resolvePrev = resolve;
        }),
    );

    await userEvent.click(screen.getByRole("button", { name: "이전 달" }));

    expect(screen.queryByText("1시간 30분")).not.toBeInTheDocument();

    await resolvePrev?.(
      periodResponse([
        { date: "2025-12-01", studySec: 7200, focusSec: 7200 },
        { date: "2025-12-02", studySec: 3600, focusSec: 3600 },
      ]),
    );
    expect(await screen.findByText("3시간")).toBeInTheDocument();
  });

  it("일간의 기간 라벨을 누르면 월 선택 시트가 열리고, 고른 달로 이동한 뒤 오늘로 돌아올 수 있다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));

    renderRecords();

    const currentMonth = monthOfDateKey(kstDateKey());
    const currentLabel = monthLabel(currentMonth);
    await screen.findByText(/요일$/);

    await userEvent.click(screen.getByRole("button", { name: currentLabel }));
    expect(await screen.findByText("월 선택")).toBeInTheDocument();
    expect(vi.mocked(trackRecordsPeriodPickerOpened)).toHaveBeenCalledWith("daily");

    // 지난해 같은 달로 건너뛴다.
    await userEvent.click(screen.getByRole("button", { name: "이전 해" }));
    await userEvent.click(screen.getByRole("button", { name: `${String(currentMonth.month)}월` }));

    const lastYear = monthLabel({ year: currentMonth.year - 1, month: currentMonth.month });
    expect(await screen.findByRole("button", { name: lastYear })).toBeInTheDocument();
    expect(screen.queryByText("월 선택")).not.toBeInTheDocument();
    expect(vi.mocked(trackRecordsPeriodPicked)).toHaveBeenLastCalledWith({
      view: "daily",
      toToday: false,
    });

    await userEvent.click(screen.getByRole("button", { name: lastYear }));
    await userEvent.click(await screen.findByRole("button", { name: "오늘" }));

    expect(await screen.findByRole("button", { name: currentLabel })).toBeInTheDocument();
    expect(vi.mocked(trackRecordsPeriodPicked)).toHaveBeenLastCalledWith({
      view: "daily",
      toToday: true,
    });
  });

  it("주간의 기간 라벨을 누르면 주 선택 시트가 열리고, 날짜를 고르면 그 날이 속한 주로 이동한다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));

    renderRecords();
    await userEvent.click(await screen.findByRole("tab", { name: "주간" }));
    expect(vi.mocked(trackRecordsViewChanged)).toHaveBeenCalledWith("weekly");

    const rangeButton = await screen.findByRole("button", { name: /\d+월 \d+일 ~/ });
    const thisWeekLabel = rangeButton.textContent;

    await userEvent.click(rangeButton);
    expect(await screen.findByText("주 선택")).toBeInTheDocument();
    expect(vi.mocked(trackRecordsPeriodPickerOpened)).toHaveBeenCalledWith("weekly");

    // 지난달 15일이 속한 주로 건너뛴다(지난달은 전부 과거라 항상 고를 수 있다).
    await userEvent.click(screen.getByRole("button", { name: "이전 달" }));
    await userEvent.click(screen.getByRole("button", { name: /월 15일$/ }));

    await waitFor(() => expect(screen.queryByText("주 선택")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /\d+월 \d+일 ~/ }).textContent).not.toBe(
      thisWeekLabel,
    );
    expect(vi.mocked(trackRecordsPeriodPicked)).toHaveBeenLastCalledWith({
      view: "weekly",
      toToday: false,
    });

    // 화살표 이동도 그대로 동작하고 계측이 나간다.
    await userEvent.click(screen.getByRole("button", { name: "이전 주" }));
    expect(vi.mocked(trackRecordsWeekChanged)).toHaveBeenLastCalledWith(-1);
  });

  it("선택일 줄의 플래너 버튼은 고른 날의 플래너를 열고, 날짜 상세 카드는 일간 탭에 없다", async () => {
    mockedStats.mockResolvedValue(statsResponse(true));

    renderRecords();

    const button = await screen.findByRole("button", { name: "플래너" });
    // 날짜 상세(과목별 시간·24시간 타임테이블)는 플래너로 옮겼다.
    expect(screen.queryByRole("img", { name: /24시간 공부 분포/ })).not.toBeInTheDocument();

    await userEvent.click(button);
    expect(await screen.findByTestId("planner-route")).toHaveTextContent(
      `/planner?userId=7&date=${kstDateKey()}`,
    );
  });

  it("주간 뷰는 주 요약 → 추이 카드 → 주 카드 → 나의 공부 리듬 순서로 보여준다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));
    mockedPeriod.mockResolvedValue(
      periodResponse(
        [{ date: kstDateKey(), studySec: 7200, focusSec: 3600 }],
        [{ date: "2026-01-01", studySec: 3600, focusSec: 1800 }],
      ),
    );

    renderRecords();
    await userEvent.click(await screen.findByRole("tab", { name: "주간" }));

    const headline = await screen.findByText("주간 순공시간");
    const chart = await screen.findByRole("img", { name: /요일별 순공시간/ });
    const best = screen.getByText("이 주 최고 기록");
    const rhythm = screen.getByRole("heading", { name: "나의 공부 리듬" });

    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(headline, chart)).toBe(true);
    expect(follows(chart, best)).toBe(true);
    expect(follows(best, rhythm)).toBe(true);
    expect(headline.parentElement).toHaveTextContent("총 공부시간 2시간");
  });

  it("주간 뷰에서 이번 주 다음(미래 주)으로는 넘어가지 않는다(이전 주로는 이동)", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));

    renderRecords();

    await userEvent.click(await screen.findByRole("tab", { name: "주간" }));

    // 초기 주(이번 주) 범위 라벨.
    const rangeLabel = await screen.findByText(/\d+월 \d+일 ~/);
    const thisWeekLabel = rangeLabel.textContent;

    // 다음 주(미래)로는 넘어가지 않는다 — 버튼이 비활성이다.
    expect(screen.getByRole("button", { name: "다음 주" })).toBeDisabled();

    // 이전 주(과거)로는 이동한다 — 범위가 바뀐다(상한이 미래에만 걸리는지 확인).
    await userEvent.click(screen.getByRole("button", { name: "이전 주" }));
    expect(screen.getByText(/\d+월 \d+일 ~/).textContent).not.toBe(thisWeekLabel);
  });

  it("주간 뷰에서 주 조회가 실패하면 순공·증감 숫자는 감추고 주 범위·네비는 남는다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));
    mockedPeriod.mockRejectedValue(new Error("기간 집계 조회 실패"));

    renderRecords();

    await userEvent.click(await screen.findByRole("tab", { name: "주간" }));

    // 주 범위 네비·리듬 카드는 상태와 무관하게 보인다.
    expect(await screen.findByText("나의 공부 리듬")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이전 주" })).toBeInTheDocument();
    // 오류 화면과 함께 "0분 · 지난주와 같아요" 같은 확정 숫자는 뜨지 않는다.
    expect(screen.queryByText("주간 순공시간")).not.toBeInTheDocument();
    expect(screen.queryByText(/지난주와 같아요/)).not.toBeInTheDocument();
    expect(screen.getByText("주간 추이를 불러오지 못했어요")).toBeInTheDocument();
  });

  it("주간 뷰에서 주 조회가 pending이면 확정 숫자·증감 문구가 뜨지 않는다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));
    mockedPeriod.mockImplementation(() => new Promise(() => {}));

    renderRecords();

    await userEvent.click(await screen.findByRole("tab", { name: "주간" }));

    expect(await screen.findByText("나의 공부 리듬")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다음 주" })).toBeInTheDocument();
    expect(screen.queryByText("0분")).not.toBeInTheDocument();
    expect(screen.queryByText(/지난주와 같아요/)).not.toBeInTheDocument();
  });

  it("period 조회가 실패해도 일별 세션 목록·선택일 제목은 그대로 보인다", async () => {
    mockedStats.mockResolvedValue(statsResponse(true));
    mockedPeriod.mockRejectedValue(new Error("기간 집계 조회 실패"));

    renderRecords();

    expect(await screen.findByRole("button", { name: /09:00부터 10:00까지/ })).toBeInTheDocument();
    expect(screen.getByText(/요일$/)).toBeInTheDocument();
    // 달 합계·하루 평균은 period가 success일 때만 숫자를 적는다 — 실패하면 0분 같은 확정 값을 그리지 않는다.
    expect(screen.queryByText(/공부한 \d+일 기준|아직 공부한 날이 없어요/)).not.toBeInTheDocument();
  });
});
