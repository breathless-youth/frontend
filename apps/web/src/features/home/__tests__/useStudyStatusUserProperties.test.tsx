import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { kstDateKey, weekDateKeys } from "@/features/records/recordsFormat";
import { setStudyStatusUserProperties } from "@/lib/amplitude";
import { getStreak, listStudySessionStats } from "@/lib/statsApi";

import { useStudyStatusUserProperties } from "../useStudyStatusUserProperties";

vi.mock("@/lib/statsApi", () => ({
  listStudySessionStats: vi.fn(),
  getStreak: vi.fn(),
}));

vi.mock("@/lib/amplitude", () => ({ setStudyStatusUserProperties: vi.fn() }));

const mockedStats = vi.mocked(listStudySessionStats);
const mockedStreak = vi.mocked(getStreak);

const statsResponse = {
  sessions: [],
  sessionCount: 1,
  totalStudySec: 7200,
  totalFocusSec: 3600,
  longestFocusSec: 1800,
  focusRate: 50,
  totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, SLEEP: 0, PAUSE: 0 },
  studiedDatesInMonth: [],
};

function createWrapper(
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useStudyStatusUserProperties", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("오늘 통계와 이번 주 스트릭으로 공부 상태를 보낸다 — 기록 탭 배너와 같은 키로 조회한다", async () => {
    mockedStats.mockResolvedValue(statsResponse);
    mockedStreak.mockResolvedValue({
      streak: 3,
      maxStreak: 9,
      studiedDatesInRange: ["2026-10-13", "2026-10-15"],
    });

    renderHook(() => useStudyStatusUserProperties(7), { wrapper: createWrapper() });

    await waitFor(() => expect(setStudyStatusUserProperties).toHaveBeenCalledTimes(1));
    expect(setStudyStatusUserProperties).toHaveBeenCalledWith({
      streakDays: 3,
      maxStreak: 9,
      weekStudyDays: 2,
      todayStudyMin: 120,
      studiedToday: true,
    });
    const todayKey = kstDateKey();
    expect(mockedStats).toHaveBeenCalledWith(todayKey);
    expect(mockedStreak).toHaveBeenCalledWith({ from: weekDateKeys(todayKey)[0], to: todayKey });
  });

  it("오늘 공부 시간이 1분 미만이면 공부하지 않은 것으로 본다", async () => {
    mockedStats.mockResolvedValue({ ...statsResponse, totalStudySec: 59 });
    mockedStreak.mockResolvedValue({ streak: 0, maxStreak: 0, studiedDatesInRange: [] });

    renderHook(() => useStudyStatusUserProperties(7), { wrapper: createWrapper() });

    await waitFor(() =>
      expect(setStudyStatusUserProperties).toHaveBeenCalledWith(
        expect.objectContaining({ todayStudyMin: 0, studiedToday: false }),
      ),
    );
  });

  it("통계를 불러오지 못하면 보내지 않는다", async () => {
    mockedStats.mockRejectedValue(new Error("network"));
    mockedStreak.mockResolvedValue({ streak: 0, maxStreak: 0, studiedDatesInRange: [] });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderHook(() => useStudyStatusUserProperties(7), { wrapper: createWrapper(queryClient) });

    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(setStudyStatusUserProperties).not.toHaveBeenCalled();
  });

  it("같은 응답을 다시 받아도 다시 보낸다", async () => {
    mockedStats.mockResolvedValue(statsResponse);
    mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderHook(() => useStudyStatusUserProperties(7), { wrapper: createWrapper(queryClient) });
    await waitFor(() => expect(setStudyStatusUserProperties).toHaveBeenCalledTimes(1));

    await act(async () => {
      await queryClient.refetchQueries();
    });

    await waitFor(() => expect(setStudyStatusUserProperties).toHaveBeenCalledTimes(2));
  });

  it("주가 바뀌어 새 주의 스트릭을 받기 전에는 지난주 값을 보내지 않는다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-17T12:00:00+09:00")); // 토요일
    mockedStats.mockResolvedValue(statsResponse);
    mockedStreak.mockResolvedValueOnce({
      streak: 3,
      maxStreak: 9,
      studiedDatesInRange: ["2026-10-13", "2026-10-15", "2026-10-16"],
    });
    // 새 주의 스트릭 응답은 오지 않은 채로 둔다.
    mockedStreak.mockReturnValue(new Promise(() => {}));

    const { rerender } = renderHook(() => useStudyStatusUserProperties(7), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(setStudyStatusUserProperties).toHaveBeenCalledTimes(1));

    vi.setSystemTime(new Date("2026-10-18T12:00:00+09:00")); // 일요일, 새 주
    rerender();
    await waitFor(() => expect(mockedStreak).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockedStats).toHaveBeenCalledTimes(2));

    expect(setStudyStatusUserProperties).toHaveBeenCalledTimes(1);
  });
});
