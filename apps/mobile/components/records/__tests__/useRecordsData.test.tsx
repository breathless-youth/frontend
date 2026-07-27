import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useFocusEffect } from "expo-router";
import type { ReactNode } from "react";

import { listStudySessionStats } from "../../../lib/statsApi";
import { statsKeys } from "../../../lib/statsQueries";
import { ensureUserRegistered } from "../../../lib/userApi";
import { useRecordsData } from "../useRecordsData";

jest.mock("expo-router", () => ({
  // 훅 단위 테스트에서는 내비게이션 컨텍스트가 없다 — 포커스 콜백은 no-op 처리.
  useFocusEffect: jest.fn(),
}));
jest.mock("../../../lib/statsApi", () => ({
  listStudySessionStats: jest.fn(),
  getStreak: jest.fn(),
}));
jest.mock("../../../lib/userApi", () => ({
  ensureUserRegistered: jest.fn(),
}));

const mockedEnsure = ensureUserRegistered as jest.MockedFunction<typeof ensureUserRegistered>;
const mockedStats = listStudySessionStats as jest.MockedFunction<typeof listStudySessionStats>;

function statsResponse(studiedDatesInMonth: string[]) {
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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useRecordsData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("선택일이 보이는 달에 있으면 선택일 조회 하나로 세션·도트를 모두 채운다", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockResolvedValue(statsResponse(["2026-07-24", "2026-07-26"]));

    const { result } = renderHook(() => useRecordsData("2026-07-26", { year: 2026, month: 7 }), {
      wrapper: createWrapper(),
    });

    expect(result.current.day.status).toBe("pending");
    await waitFor(() => expect(result.current.day.status).toBe("success"));
    expect(result.current.studiedDates).toEqual(["2026-07-24", "2026-07-26"]);
    // userId 확보 후 선택일로 딱 한 번 조회한다
    expect(mockedStats).toHaveBeenCalledTimes(1);
    expect(mockedStats).toHaveBeenCalledWith(7, "2026-07-26");
  });

  it("다른 달을 보는 중이면 그 달 1일을 추가 조회해 도트만 쓴다 — 선택일 데이터는 유지", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockImplementation(async (_userId, date) =>
      date === "2026-08-01"
        ? statsResponse(["2026-08-02", "2026-08-03"])
        : statsResponse(["2026-07-26"]),
    );

    const { result } = renderHook(() => useRecordsData("2026-07-26", { year: 2026, month: 8 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.day.status).toBe("success"));
    await waitFor(() => expect(result.current.studiedDates).toEqual(["2026-08-02", "2026-08-03"]));
    expect(mockedStats).toHaveBeenCalledWith(7, "2026-07-26");
    expect(mockedStats).toHaveBeenCalledWith(7, "2026-08-01");
    // 선택일(7/26) 요약은 8월을 보는 동안에도 success로 유지된다
    if (result.current.day.status === "success") {
      expect(result.current.day.stats.studiedDatesInMonth).toEqual(["2026-07-26"]);
    }
  });

  it("익명 등록 실패 시 error 상태가 된다", async () => {
    mockedEnsure.mockResolvedValue(null);

    const { result } = renderHook(() => useRecordsData("2026-07-26", { year: 2026, month: 7 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.day.status).toBe("error"));
    expect(mockedStats).not.toHaveBeenCalled();
  });

  it("조회 실패 시 error 상태가 되고 retry로 재시도한다", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockRejectedValueOnce(new Error("network"));

    const { result } = renderHook(() => useRecordsData("2026-07-26", { year: 2026, month: 7 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.day.status).toBe("error"));

    mockedStats.mockResolvedValue(statsResponse([]));
    if (result.current.day.status === "error") {
      result.current.day.retry();
    }
    await waitFor(() => expect(result.current.day.status).toBe("success"));
  });

  it("달 도트 조회가 실패해도 선택일은 success로 유지되고 도트만 빈다", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockImplementation(async (_userId, date) => {
      if (date === "2026-08-01") {
        throw new Error("network");
      }
      return statsResponse(["2026-07-26"]);
    });

    const { result } = renderHook(() => useRecordsData("2026-07-26", { year: 2026, month: 8 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(mockedStats).toHaveBeenCalledWith(7, "2026-08-01"));
    await waitFor(() => expect(result.current.day.status).toBe("success"));
    // 도트 실패는 화면을 막지 않는다 — error로 떨어지지 않고 빈 도트로 유지된다.
    expect(result.current.studiedDates).toEqual([]);
  });

  it("탭 포커스 콜백은 userId 확보 후에만 stats 쿼리를 invalidate한다", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockResolvedValue(statsResponse([]));
    const mockedFocusEffect = useFocusEffect as jest.MockedFunction<typeof useFocusEffect>;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useRecordsData("2026-07-26", { year: 2026, month: 7 }), {
      wrapper,
    });

    // userId 확보 전의 포커스 콜백은 invalidate하지 않는다.
    act(() => {
      mockedFocusEffect.mock.calls.at(-1)?.[0]?.();
    });
    expect(invalidateSpy).not.toHaveBeenCalled();

    await waitFor(() => expect(result.current.day.status).toBe("success"));

    act(() => {
      mockedFocusEffect.mock.calls.at(-1)?.[0]?.();
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: statsKeys.all });
  });
});
