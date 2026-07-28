import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useFocusEffect } from "expo-router";
import type { ReactNode } from "react";

import type { StudySessionListResponse, StudySessionStreakResponse } from "@focuson/types";

import { weekDateKeys } from "../../../lib/recordsFormat";
import { getStreak, listStudySessionStats } from "../../../lib/statsApi";
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
const mockedStreak = getStreak as jest.MockedFunction<typeof getStreak>;
const TODAY_KEY = "2026-07-29";

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
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useRecordsData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 스트릭을 검증하지 않는 기존 테스트가 깨지지 않도록 기본값을 둔다 — 각 테스트가 필요하면 덮어쓴다.
    mockedStreak.mockResolvedValue({ streak: 0, maxStreak: 0, studiedDatesInRange: [] });
  });

  it("서버 응답에 studiedDatesInRange가 빠져도(계약 드리프트) 배너는 빈 도트로 동작한다", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockResolvedValue(statsResponse([]));
    // 계약상 필수 필드지만 런타임 검증이 없으므로 누락 응답을 흉내 낸다 — 캐스트는 그 드리프트 재현용.
    mockedStreak.mockResolvedValue({
      streak: 3,
      maxStreak: 9,
    } as unknown as StudySessionStreakResponse);

    const { result } = renderHook(
      () => useRecordsData("2026-07-26", { year: 2026, month: 7 }, TODAY_KEY),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.streakBanner.status).toBe("success"));
    expect(result.current.streakBanner).toEqual({
      status: "success",
      streakDays: 3,
      doneDates: [],
    });
  });

  it("선택일이 보이는 달에 있으면 선택일 조회 하나로 세션·도트를 모두 채운다", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockResolvedValue(statsResponse(["2026-07-24", "2026-07-26"]));

    const { result } = renderHook(
      () => useRecordsData("2026-07-26", { year: 2026, month: 7 }, TODAY_KEY),
      {
        wrapper: createWrapper(),
      },
    );

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

    const { result } = renderHook(
      () => useRecordsData("2026-07-26", { year: 2026, month: 8 }, TODAY_KEY),
      {
        wrapper: createWrapper(),
      },
    );

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

    const { result } = renderHook(
      () => useRecordsData("2026-07-26", { year: 2026, month: 7 }, TODAY_KEY),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => expect(result.current.day.status).toBe("error"));
    expect(mockedStats).not.toHaveBeenCalled();
  });

  it("조회 실패 시 error 상태가 되고 retry로 재시도한다", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockRejectedValueOnce(new Error("network"));

    const { result } = renderHook(
      () => useRecordsData("2026-07-26", { year: 2026, month: 7 }, TODAY_KEY),
      {
        wrapper: createWrapper(),
      },
    );

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

    const { result } = renderHook(
      () => useRecordsData("2026-07-26", { year: 2026, month: 8 }, TODAY_KEY),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => expect(mockedStats).toHaveBeenCalledWith(7, "2026-08-01"));
    await waitFor(() => expect(result.current.day.status).toBe("success"));
    // 도트 실패는 화면을 막지 않는다 — error로 떨어지지 않고 빈 도트로 유지된다.
    expect(result.current.studiedDates).toEqual([]);
  });

  it("같은 달의 미캐시 날짜를 선택해도 달력 도트가 비지 않는다 — 이전 응답 유지", async () => {
    mockedEnsure.mockResolvedValue(7);
    const dots = ["2026-07-24", "2026-07-26"];
    let resolveSecond: ((value: StudySessionListResponse) => void) | undefined;
    mockedStats.mockImplementation((_userId, date) => {
      if (date === "2026-07-26") {
        return Promise.resolve(statsResponse(dots));
      }
      // 미캐시 날짜(7/24)의 응답을 붙잡아 둔다 — 로딩 중 상태를 검사하기 위함.
      return new Promise<StudySessionListResponse>((resolve) => {
        resolveSecond = resolve;
      });
    });

    const { result, rerender } = renderHook(
      ({ selectedKey }: { selectedKey: string }) =>
        useRecordsData(selectedKey, { year: 2026, month: 7 }, TODAY_KEY),
      { wrapper: createWrapper(), initialProps: { selectedKey: "2026-07-26" } },
    );
    await waitFor(() => expect(result.current.day.status).toBe("success"));
    expect(result.current.studiedDates).toEqual(dots);

    rerender({ selectedKey: "2026-07-24" });

    // 새 날짜 응답이 오기 전에도 도트는 이전 값으로 유지된다 (빈 배열 → 깜빡임 금지).
    expect(result.current.studiedDates).toEqual(dots);
    // 반면 요약·리스트는 새 날짜 데이터가 아직 없으므로 스켈레톤(pending)이어야 한다 —
    // 이전 날짜 데이터가 새 날짜 제목 아래 보이면 안 된다.
    expect(result.current.day.status).toBe("pending");

    await act(async () => {
      resolveSecond?.(statsResponse(dots));
    });
    await waitFor(() => expect(result.current.day.status).toBe("success"));
  });

  it("탭 포커스 콜백은 userId 확보 후에만 stats 쿼리를 invalidate한다", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockResolvedValue(statsResponse([]));
    const mockedFocusEffect = useFocusEffect as jest.MockedFunction<typeof useFocusEffect>;

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useRecordsData("2026-07-26", { year: 2026, month: 7 }, TODAY_KEY),
      {
        wrapper,
      },
    );

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

  it("스트릭 조회 성공 시 streakBanner가 success이고 주 일요일~오늘로 조회한다", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockResolvedValue(statsResponse([]));
    mockedStreak.mockResolvedValue({
      streak: 3,
      maxStreak: 9,
      studiedDatesInRange: ["2026-07-27"],
    });

    const { result } = renderHook(
      () => useRecordsData("2026-07-26", { year: 2026, month: 7 }, TODAY_KEY),
      { wrapper: createWrapper() },
    );

    await waitFor(() =>
      expect(result.current.streakBanner).toEqual({
        status: "success",
        streakDays: 3,
        doneDates: ["2026-07-27"],
      }),
    );
    expect(mockedStreak).toHaveBeenCalledWith(7, {
      from: weekDateKeys(TODAY_KEY)[0],
      to: TODAY_KEY,
    });
  });

  it("스트릭 조회 실패 시 캐시가 없으면 streakBanner가 hidden이지만 day 영역은 정상이다", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockResolvedValue(statsResponse(["2026-07-26"]));
    mockedStreak.mockRejectedValue(new Error("network"));

    const { result } = renderHook(
      () => useRecordsData("2026-07-26", { year: 2026, month: 7 }, TODAY_KEY),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.day.status).toBe("success"));
    await waitFor(() => expect(result.current.streakBanner).toEqual({ status: "hidden" }));
  });

  it("day·streak 모두 실패 후 retry가 둘 다 재조회한다", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockRejectedValueOnce(new Error("network"));
    mockedStreak.mockRejectedValueOnce(new Error("network"));

    const { result } = renderHook(
      () => useRecordsData("2026-07-26", { year: 2026, month: 7 }, TODAY_KEY),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.day.status).toBe("error"));
    expect(result.current.streakBanner).toEqual({ status: "hidden" });

    mockedStats.mockResolvedValue(statsResponse(["2026-07-26"]));
    mockedStreak.mockResolvedValue({
      streak: 1,
      maxStreak: 1,
      studiedDatesInRange: ["2026-07-26"],
    });

    if (result.current.day.status === "error") {
      result.current.day.retry();
    }

    await waitFor(() => expect(result.current.day.status).toBe("success"));
    await waitFor(() =>
      expect(result.current.streakBanner).toEqual({
        status: "success",
        streakDays: 1,
        doneDates: ["2026-07-26"],
      }),
    );
    expect(mockedStats).toHaveBeenCalledTimes(2);
    expect(mockedStreak).toHaveBeenCalledTimes(2);
  });

  it("자정 넘김으로 todayKey가 바뀌어도 새 조회가 pending 중이면 스트릭 배너는 이전 데이터로 success 유지", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockResolvedValue(statsResponse([]));
    mockedStreak.mockResolvedValue({
      streak: 5,
      maxStreak: 10,
      studiedDatesInRange: ["2026-07-28"],
    });

    const { result, rerender } = renderHook(
      ({ todayKey }: { todayKey: string }) =>
        useRecordsData("2026-07-26", { year: 2026, month: 7 }, todayKey),
      { wrapper: createWrapper(), initialProps: { todayKey: TODAY_KEY } },
    );

    await waitFor(() =>
      expect(result.current.streakBanner).toEqual({
        status: "success",
        streakDays: 5,
        doneDates: ["2026-07-28"],
      }),
    );

    // 자정을 지나 todayKey가 변한다 — 새 조회는 never-resolving으로 pending 상태 유지
    mockedStreak.mockImplementation(
      () =>
        new Promise(() => {
          // never resolves
        }),
    );

    rerender({ todayKey: "2026-07-30" });

    // 새 스트릭 조회가 pending이어도 이전 응답 데이터는 유지되고 배너는 success를 유지한다
    expect(result.current.streakBanner).toEqual({
      status: "success",
      streakDays: 5,
      doneDates: ["2026-07-28"],
    });
  });
});
