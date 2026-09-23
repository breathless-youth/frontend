import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
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
import { trackRecordsMonthChanged } from "@/lib/amplitude";
import { RecordsPage } from "@/routes/RecordsPage";

/**
 * (모바일판 `__tests__/records.test.tsx`에서 케이스 이식 — BY-330, v2 조립으로 갱신 — BY-567 Task 8.
 * RN판은 fake timers로 "오늘"을 고정하지만, 웹판은 오늘을 매 렌더 계산으로 바꿨다
 * (`RecordsPage`의 RN판 차이 주석 참고) — 시계를 고정하는 대신 테스트가 `recordsFormat`의
 * 같은 순수 함수로 기대값을 계산한다. 실행 날짜와 무관하게 항상 맞는다.
 *
 * 스트릭 배너·요약 타일·`studiedDatesInMonth`/streak 도트 관련 테스트는 v2에서 걷어낸
 * 기능이라 지웠다 — 대신 세그먼트·선택일 제목·월 요약을 확인한다. `getPeriodStats` 목을
 * 셋업에 더했다(달력 농도·월 요약이 이제 이 조회 하나로 채워진다).
 */
vi.mock("@/lib/statsApi", () => ({
  listStudySessionStats: vi.fn(),
  getPeriodStats: vi.fn(),
}));
vi.mock("@/lib/amplitude", () => ({
  trackRecordsDateSelected: vi.fn(),
  trackRecordsMonthChanged: vi.fn(),
  trackErrorRetryPressed: vi.fn(),
}));

const mockedStats = vi.mocked(listStudySessionStats);
const mockedPeriod = vi.mocked(getPeriodStats);
const mockedTrackMonthChanged = vi.mocked(trackRecordsMonthChanged);

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
    mockedPeriod.mockResolvedValue(periodResponse());
  });

  it("세션 행을 누르면 상세 바텀시트가 열리고 닫기로 닫힌다", async () => {
    mockedStats.mockResolvedValue(statsResponse(true));

    renderRecords();

    const row = await screen.findByRole("button", { name: /09:00 ~ 10:00/ });
    await userEvent.click(row);
    const close = await screen.findByRole("button", { name: "닫기" });
    expect(close).toBeInTheDocument();
    await userEvent.click(close);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "닫기" })).not.toBeInTheDocument();
    });
  });

  it("선택일(기본값 오늘)의 세션 목록을 v2 행(시각 범위·순공·집중률)으로 보여준다", async () => {
    mockedStats.mockResolvedValue(statsResponse(true));

    renderRecords();

    // startedAt 2026-01-01T00:00Z / endedAt 2026-01-01T01:00Z → KST 09:00 ~ 10:00.
    expect(await screen.findByText("09:00 ~ 10:00")).toBeInTheDocument();
    expect(screen.getByText("순공 30분 · 집중 50%")).toBeInTheDocument();
    expect(screen.queryByText("이 날은 기록이 없어요")).not.toBeInTheDocument();
  });

  it("선택일에 기록이 없으면 빈 상태 문구를 카드 안에 보여준다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));

    renderRecords();

    expect(await screen.findByText("이 날은 기록이 없어요")).toBeInTheDocument();
  });

  it("일간 세그먼트가 눌린 상태이고 주간은 비활성이다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));

    renderRecords();

    const daily = await screen.findByRole("tab", { name: "일간" });
    expect(daily).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "주간" })).toBeDisabled();
  });

  it("선택일 제목을 요일과 함께 보여준다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));

    renderRecords();

    expect(await screen.findByText(/요일$/)).toBeInTheDocument();
  });

  it("월 순공 합계를 월 요약에 보여준다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));
    const month = monthOfDateKey(kstDateKey());
    mockedPeriod.mockResolvedValue(
      periodResponse([{ date: "2026-01-01", studySec: 3600, focusSec: 3600 }]),
    );

    renderRecords();

    expect(await screen.findByText(`${month.month}월 순공시간`)).toBeInTheDocument();
    expect(screen.getByText("1시간")).toBeInTheDocument();
  });

  it('헤더 이전/다음 달 버튼을 누르면 달이 바뀌고 계측이 { delta, method: "button" }로 나가지만, 선택일은 그대로 유지한다(2026-07-28 확정 정책 + 코덱스 리뷰 반영)', async () => {
    mockedStats.mockResolvedValue(statsResponse(false));

    renderRecords();

    const todayKey = kstDateKey();
    const currentMonth = monthOfDateKey(todayKey);
    await screen.findByText(/요일$/);

    await userEvent.click(screen.getByRole("button", { name: "다음 달" }));
    expect(screen.getByText(monthLabel(shiftMonth(currentMonth, 1)))).toBeInTheDocument();
    expect(screen.getByText(/요일$/)).toBeInTheDocument();
    expect(mockedTrackMonthChanged).toHaveBeenNthCalledWith(1, { delta: 1, method: "button" });

    await userEvent.click(screen.getByRole("button", { name: "이전 달" }));
    expect(screen.getByText(monthLabel(currentMonth))).toBeInTheDocument();
    expect(mockedTrackMonthChanged).toHaveBeenNthCalledWith(2, { delta: -1, method: "button" });
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
    });

    renderRecords();

    await screen.findByText(/요일$/);
    // 내림차순(최신순 고정) — late(30분) → mid(20분) → early(10분).
    const sublines = screen
      .getAllByText(/^순공 (10|20|30)분 · 집중 50%$/)
      .map((el) => el.textContent);
    expect(sublines).toEqual([
      "순공 30분 · 집중 50%",
      "순공 20분 · 집중 50%",
      "순공 10분 · 집중 50%",
    ]);
  });

  it("userId가 없으면 데이터 조회 없이 단독 모드 안내만 보여준다", () => {
    renderRecords("/records");

    expect(screen.getByText(/기기 등록 전/)).toBeInTheDocument();
    expect(mockedStats).not.toHaveBeenCalled();
    expect(mockedPeriod).not.toHaveBeenCalled();
  });

  it("월을 옮기는 동안 이전 달 월 순공 합계가 새 달 제목 아래 보이지 않는다", async () => {
    mockedStats.mockResolvedValue(statsResponse(false));
    mockedPeriod.mockResolvedValueOnce(
      periodResponse([{ date: "2026-01-01", studySec: 3600, focusSec: 3600 }]),
    );

    renderRecords();

    expect(await screen.findByText("1시간")).toBeInTheDocument();

    // 다음 달 조회를 붙잡아 둔다 — period는 placeholderData를 쓰지 않으므로 새 조회가 끝날
    // 때까지 pending이고, 화면은 1월 합계를 새 달의 성공으로 보여주지 않는다.
    let resolveNext: ((value: StudyPeriodStatsResponse) => void) | undefined;
    mockedPeriod.mockImplementation(
      () =>
        new Promise<StudyPeriodStatsResponse>((resolve) => {
          resolveNext = resolve;
        }),
    );

    await userEvent.click(screen.getByRole("button", { name: "다음 달" }));

    expect(screen.queryByText("1시간")).not.toBeInTheDocument();

    await resolveNext?.(periodResponse([{ date: "2026-02-01", studySec: 1800, focusSec: 1800 }]));
    expect(await screen.findByText("30분")).toBeInTheDocument();
  });

  it("period 조회가 실패해도 일별 세션 목록·선택일 제목은 그대로 보인다", async () => {
    mockedStats.mockResolvedValue(statsResponse(true));
    mockedPeriod.mockRejectedValue(new Error("기간 집계 조회 실패"));

    renderRecords();

    expect(await screen.findByText("09:00 ~ 10:00")).toBeInTheDocument();
    expect(screen.getByText(/요일$/)).toBeInTheDocument();
    // 월 요약 카드는 period가 success일 때만 그린다 — 실패 시 렌더하지 않는다(합계를 비운다).
    expect(screen.queryByText(/순공시간$/)).not.toBeInTheDocument();
  });
});
