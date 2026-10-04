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

describe("useWeeklyData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("userId가 null이면 pending이고 조회를 내보내지 않는다(enabled false)", () => {
    mockedPeriod.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useWeeklyData(null, WEEK_ANCHOR), {
      wrapper: createWrapper(),
    });

    expect(result.current.week.status).toBe("pending");
    expect(mockedPeriod).not.toHaveBeenCalled();
  });

  it("success면 그 주의 daily와 직전 주의 compareDaily를 매핑한다", async () => {
    mockedPeriod.mockResolvedValue(
      periodResponse(
        [{ date: "2026-09-18", studySec: 1200, focusSec: 1200 }],
        [{ date: "2026-09-11", studySec: 900, focusSec: 900 }],
      ),
    );

    const { result } = renderHook(() => useWeeklyData(1, WEEK_ANCHOR), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.week.status).toBe("success"));
    if (result.current.week.status !== "success") {
      throw new Error("week should be success");
    }
    expect(result.current.week.daily).toEqual([
      { date: "2026-09-18", studySec: 1200, focusSec: 1200 },
    ]);
    expect(result.current.week.compareDaily).toEqual([
      { date: "2026-09-11", studySec: 900, focusSec: 900 },
    ]);
  });

  it("주를 옮기면 그 주와 직전 주 범위로 다시 조회한다(달 조회는 내보내지 않는다)", async () => {
    mockedPeriod.mockResolvedValue(periodResponse([]));

    const { rerender } = renderHook(({ anchor }) => useWeeklyData(1, anchor), {
      wrapper: createWrapper(),
      initialProps: { anchor: "2026-09-18" }, // 2026-09-14(월)~20(일) 주
    });

    await waitFor(() =>
      expect(mockedPeriod).toHaveBeenCalledWith(
        { from: "2026-09-14", to: "2026-09-20" },
        { from: "2026-09-07", to: "2026-09-13" },
      ),
    );
    expect(mockedPeriod).toHaveBeenCalledTimes(1);

    // 이전 주로 이동(anchor 2026-09-11 → 그 주 2026-09-07~13).
    rerender({ anchor: "2026-09-11" });

    await waitFor(() =>
      expect(mockedPeriod).toHaveBeenCalledWith(
        { from: "2026-09-07", to: "2026-09-13" },
        { from: "2026-08-31", to: "2026-09-06" },
      ),
    );
  });

  it("조회가 실패하면 error다", async () => {
    mockedPeriod.mockRejectedValue(new Error("기간 집계 조회 실패"));

    const { result } = renderHook(() => useWeeklyData(1, WEEK_ANCHOR), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.week.status).toBe("error"));
  });
});
