import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudyPeriodStatsResponse } from "@focusmakers/types";
import { getPeriodStats } from "@/lib/statsApi";

import { useWeeklyData } from "../useWeeklyData";

vi.mock("@/lib/statsApi", () => ({
  getPeriodStats: vi.fn(),
}));

const mockedPeriod = vi.mocked(getPeriodStats);

function periodResponse(
  dailyList: StudyPeriodStatsResponse["dailyList"],
  compareDailyList: StudyPeriodStatsResponse["compareDailyList"] = [],
): StudyPeriodStatsResponse {
  return {
    from: "2026-09-14",
    to: "2026-09-20",
    compareFrom: null,
    compareTo: null,
    dailyList,
    compareDailyList,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const WEEK_ANCHOR = "2026-09-18";
const MONTH = { year: 2026, month: 9 };

describe("useWeeklyData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("userId가 null이면 두 조회 모두 pending이고 조회를 내보내지 않는다(enabled false)", () => {
    mockedPeriod.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useWeeklyData(null, WEEK_ANCHOR, MONTH), {
      wrapper: createWrapper(),
    });

    expect(result.current.week.status).toBe("pending");
    expect(result.current.month.status).toBe("pending");
    expect(mockedPeriod).not.toHaveBeenCalled();
  });

  it("둘 다 success면 week/month 각각 daily·compareDaily를 매핑한다", async () => {
    // week 범위(2026-09-14~20)와 month 범위(2026-09-01~30)로 서로 다른 응답을 준다.
    mockedPeriod.mockImplementation((range) => {
      if (range.from === "2026-09-01") {
        return Promise.resolve(
          periodResponse(
            [{ date: "2026-09-04", studySec: 600, focusSec: 600 }],
            [{ date: "2026-08-04", studySec: 300, focusSec: 300 }],
          ),
        );
      }
      return Promise.resolve(
        periodResponse(
          [{ date: "2026-09-18", studySec: 1200, focusSec: 1200 }],
          [{ date: "2026-09-11", studySec: 900, focusSec: 900 }],
        ),
      );
    });

    const { result } = renderHook(() => useWeeklyData(1, WEEK_ANCHOR, MONTH), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.week.status).toBe("success"));
    await waitFor(() => expect(result.current.month.status).toBe("success"));

    if (result.current.week.status !== "success" || result.current.month.status !== "success") {
      throw new Error("both should be success");
    }
    expect(result.current.week.daily).toEqual([
      { date: "2026-09-18", studySec: 1200, focusSec: 1200 },
    ]);
    expect(result.current.week.compareDaily).toEqual([
      { date: "2026-09-11", studySec: 900, focusSec: 900 },
    ]);
    expect(result.current.month.daily).toEqual([
      { date: "2026-09-04", studySec: 600, focusSec: 600 },
    ]);
    expect(result.current.month.compareDaily).toEqual([
      { date: "2026-08-04", studySec: 300, focusSec: 300 },
    ]);
  });

  it("한쪽 조회만 실패하면 그쪽만 error이고 다른 쪽은 success다", async () => {
    // month(2026-09-01~) 실패, week 성공.
    mockedPeriod.mockImplementation((range) => {
      if (range.from === "2026-09-01") {
        return Promise.reject(new Error("기간 집계 조회 실패"));
      }
      return Promise.resolve(
        periodResponse([{ date: "2026-09-18", studySec: 1200, focusSec: 1200 }]),
      );
    });

    const { result } = renderHook(() => useWeeklyData(1, WEEK_ANCHOR, MONTH), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.month.status).toBe("error"));
    await waitFor(() => expect(result.current.week.status).toBe("success"));
  });
});
