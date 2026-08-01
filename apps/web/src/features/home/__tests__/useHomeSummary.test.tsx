import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getStreak, listStudySessionStats } from "@/lib/statsApi";

import { useHomeSummary } from "../useHomeSummary";

/**
 * (모바일판 `components/home/__tests__/useHomeSummary.test.tsx`에서 이식 — BY-329.
 * 익명 등록 쿼리는 웹에 없다: userId는 셸이 URL로 주므로 훅 인자로 받는다.)
 */
vi.mock("@/lib/statsApi", () => ({
  listStudySessionStats: vi.fn(),
  getStreak: vi.fn(),
}));

const mockedStats = vi.mocked(listStudySessionStats);
const mockedStreak = vi.mocked(getStreak);

const statsResponse = {
  sessions: [],
  sessionCount: 1,
  totalStudySec: 7200,
  totalFocusSec: 3600,
  longestFocusSec: 1800,
  focusRate: 50,
  totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, PAUSE: 0 },
  studiedDatesInMonth: [],
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useHomeSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("통계·스트릭 조회 후 success 상태로 화면 모델을 준다", async () => {
    mockedStats.mockResolvedValue(statsResponse);
    mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });

    const { result } = renderHook(() => useHomeSummary(7), { wrapper: createWrapper() });

    expect(result.current.status).toBe("pending");
    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current).toEqual({
      status: "success",
      summary: {
        focusSec: 3600,
        studySec: 7200,
        focusRate: 50,
        streakDays: 3,
        longestFocusSec: 1800,
      },
    });
    expect(mockedStats).toHaveBeenCalledWith(7, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(mockedStreak).toHaveBeenCalledWith(7, undefined);
  });

  it("통계 조회 실패 시 error 상태가 되고 retry로 재시도한다", async () => {
    mockedStats.mockRejectedValueOnce(new Error("network"));
    mockedStreak.mockResolvedValue({ streak: 0, maxStreak: 0, studiedDatesInRange: [] });

    const { result } = renderHook(() => useHomeSummary(7), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe("error"));

    mockedStats.mockResolvedValue(statsResponse);
    if (result.current.status === "error") {
      result.current.retry();
    }
    await waitFor(() => expect(result.current.status).toBe("success"));
  });

  it("스트릭 조회 실패도 error 상태로 합쳐진다", async () => {
    mockedStats.mockResolvedValue(statsResponse);
    mockedStreak.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useHomeSummary(7), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe("error"));
  });
});
