import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudyPeriodStatsResponse, StudySessionListResponse } from "@focusmakers/types";
import { getPeriodStats, listStudySessionStats } from "@/lib/statsApi";

import { useRecordsData } from "../useRecordsData";

/**
 * (RN 원본 `apps/mobile/components/records/__tests__/useRecordsData.test.tsx`의
 * "같은 달의 미캐시 날짜를 선택해도 달력 도트가 비지 않는다" 케이스를 웹 훅 시그니처로 이식 —
 * BY-330 리뷰 보강. 웹판은 userId를 인자로 직접 받으므로 등록 쿼리 모킹이 없다.)
 *
 * BY-567 Task 7: 달력 도트는 이제 monthStats/streak가 아니라 period 조회(getPeriodStats)가
 * 채운다. streak 관련 단언은 지우고 period 단언을 더했다.
 */
vi.mock("@/lib/statsApi", () => ({
  listStudySessionStats: vi.fn(),
  getPeriodStats: vi.fn(),
}));

const mockedStats = vi.mocked(listStudySessionStats);
const mockedPeriod = vi.mocked(getPeriodStats);

function statsResponse(studiedDatesInMonth: string[]): StudySessionListResponse {
  return {
    sessions: [],
    sessionCount: 0,
    totalStudySec: 0,
    totalFocusSec: 0,
    longestFocusSec: 0,
    focusRate: 0,
    totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, PAUSE: 0 },
    studiedDatesInMonth,
  };
}

function periodResponse(
  dailyList: StudyPeriodStatsResponse["dailyList"],
  compareDailyList: StudyPeriodStatsResponse["compareDailyList"] = [],
): StudyPeriodStatsResponse {
  return {
    from: "2026-07-01",
    to: "2026-07-31",
    compareFrom: null,
    compareTo: null,
    dailyList,
    compareDailyList,
  };
}

function createWrapper() {
  // 이 파일이 쓰는 2026-07 고정 날짜는 dailyStatsQuery가 정착된 날짜로 판정해 쿼리 단위
  // gcTime 30분을 실으므로, 그 키들에는 아래 gcTime 0이 덮여 이미 받은 날짜를 다시 눌러도
  // 재조회가 나가지 않는다.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const MONTH = { year: 2026, month: 7 };

describe("useRecordsData — placeholder 가드(useRecordsData.ts의 !day.isPlaceholderData)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPeriod.mockResolvedValue(periodResponse([]));
  });

  it("같은 달의 미캐시 날짜를 선택해도 이전 날짜 데이터가 새 날짜 아래 보이지 않는다 — pending 유지", async () => {
    const dots = ["2026-07-24", "2026-07-26"];
    let resolveSecond: ((value: StudySessionListResponse) => void) | undefined;
    mockedStats.mockImplementation((date) => {
      if (date === "2026-07-26") {
        return Promise.resolve(statsResponse(dots));
      }
      // 미캐시 날짜(7/24) 응답을 붙잡아 둔다 — placeholder 유지 중 상태를 검사하기 위함.
      return new Promise<StudySessionListResponse>((resolve) => {
        resolveSecond = resolve;
      });
    });

    const { result, rerender } = renderHook(
      ({ selectedKey }: { selectedKey: string }) => useRecordsData(7, selectedKey, MONTH),
      { wrapper: createWrapper(), initialProps: { selectedKey: "2026-07-26" } },
    );
    await waitFor(() => expect(result.current.day.status).toBe("success"));

    rerender({ selectedKey: "2026-07-24" });

    // 요약·리스트(day)는 placeholder를 success로 취급하지 않는다 — 7/24 응답이 오기 전까지는
    // 7/26 데이터가 "7/24 학습 요약" 제목 아래 새어나오면 안 되므로 pending으로 남는다.
    expect(result.current.day.status).toBe("pending");

    await act(async () => {
      resolveSecond?.(statsResponse(dots));
    });
    await waitFor(() => expect(result.current.day.status).toBe("success"));
  });
});

describe("useRecordsData — period 조회(dayFocusSec·period 상태)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedStats.mockResolvedValue(statsResponse([]));
  });

  it("보이는 달의 period 응답으로 dayFocusSec와 period.daily를 채운다", async () => {
    mockedPeriod.mockResolvedValue(
      periodResponse([{ date: "2026-09-04", studySec: 11160, focusSec: 11160 }]),
    );

    const { result } = renderHook(() => useRecordsData(1, "2026-09-18", { year: 2026, month: 9 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.period.status).toBe("success"));
    expect(result.current.dayFocusSec.get("2026-09-04")).toBe(11160);
  });

  it("period 조회 전에는 dayFocusSec가 비어 있고 period는 pending이다", () => {
    mockedPeriod.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useRecordsData(1, "2026-09-18", { year: 2026, month: 9 }), {
      wrapper: createWrapper(),
    });

    expect(result.current.period.status).toBe("pending");
    expect(result.current.dayFocusSec.size).toBe(0);
  });

  it("period 조회가 실패하면 period.status가 error가 된다", async () => {
    mockedPeriod.mockRejectedValue(new Error("기간 집계 조회 실패"));

    const { result } = renderHook(() => useRecordsData(1, "2026-09-18", { year: 2026, month: 9 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.period.status).toBe("error"));
  });

  it("월을 옮기는 동안(placeholder) period.status는 success가 아니고 dayFocusSec는 비어 있다 — 코덱스 리뷰 반영", async () => {
    mockedPeriod.mockResolvedValueOnce(
      periodResponse([{ date: "2026-09-04", studySec: 11160, focusSec: 11160 }]),
    );

    const { result, rerender } = renderHook(
      ({ month }: { month: { year: number; month: number } }) =>
        useRecordsData(1, "2026-09-18", month),
      { wrapper: createWrapper(), initialProps: { month: { year: 2026, month: 9 } } },
    );
    await waitFor(() => expect(result.current.period.status).toBe("success"));
    expect(result.current.dayFocusSec.get("2026-09-04")).toBe(11160);

    // 다음 달로 넘어간다 — period는 placeholderData를 쓰지 않으므로 새 조회가 끝날 때까지
    // data가 undefined로 즉시 비워진다.
    let resolveOctober: ((value: StudyPeriodStatsResponse) => void) | undefined;
    mockedPeriod.mockImplementation(
      () =>
        new Promise<StudyPeriodStatsResponse>((resolve) => {
          resolveOctober = resolve;
        }),
    );
    rerender({ month: { year: 2026, month: 10 } });

    // 10월 제목 아래 9월 합계·농도가 새어나오면 안 된다 — 새 조회 동안 pending으로 남는다.
    expect(result.current.period.status).toBe("pending");
    expect(result.current.dayFocusSec.size).toBe(0);

    await act(async () => {
      resolveOctober?.(periodResponse([{ date: "2026-10-02", studySec: 600, focusSec: 600 }]));
    });
    await waitFor(() => expect(result.current.period.status).toBe("success"));
    expect(result.current.dayFocusSec.get("2026-10-02")).toBe(600);
  });
});
