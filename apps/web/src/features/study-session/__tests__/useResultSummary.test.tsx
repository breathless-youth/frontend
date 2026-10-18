import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setStudyDaysTotalUserProperty } from "@/lib/amplitude";
import { getStudyDays, listStudySessionStats } from "@/lib/statsApi";

import { useResultSummary } from "../useResultSummary";

vi.mock("@/lib/statsApi", () => ({
  listStudySessionStats: vi.fn(),
  getStudyDays: vi.fn(),
}));
vi.mock("@/lib/amplitude", () => ({ setStudyDaysTotalUserProperty: vi.fn() }));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useResultSummary 푸시 타겟용 user property", () => {
  beforeEach(() => {
    vi.mocked(listStudySessionStats).mockReset();
    vi.mocked(getStudyDays).mockReset();
    vi.mocked(setStudyDaysTotalUserProperty).mockReset();
  });

  it("누적 공부일을 받으면 그 값을 보낸다", async () => {
    vi.mocked(listStudySessionStats).mockRejectedValue(new Error("network"));
    vi.mocked(getStudyDays).mockResolvedValue({ totalDays: 12 });

    const { result } = renderHook(() => useResultSummary(7), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.studyDays).toEqual({ status: "success", value: 12 }));
    expect(setStudyDaysTotalUserProperty).toHaveBeenCalledTimes(1);
    expect(setStudyDaysTotalUserProperty).toHaveBeenCalledWith(12);
  });

  it("누적 공부일 조회에 실패하면 보내지 않는다", async () => {
    vi.mocked(listStudySessionStats).mockResolvedValue({
      sessions: [],
      sessionCount: 0,
      totalStudySec: 0,
      totalFocusSec: 0,
      longestFocusSec: 0,
      focusRate: 0,
      totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, SLEEP: 0, PAUSE: 0 },
      studiedDatesInMonth: [],
    });
    vi.mocked(getStudyDays).mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useResultSummary(7), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.studyDays).toEqual({ status: "error" }));
    expect(setStudyDaysTotalUserProperty).not.toHaveBeenCalled();
  });
});
