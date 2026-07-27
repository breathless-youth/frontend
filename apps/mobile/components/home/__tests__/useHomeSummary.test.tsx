import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

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

import { getStreak, listStudySessionStats } from "../../../lib/statsApi";
import { ensureUserRegistered } from "../../../lib/userApi";
import { useHomeSummary } from "../useHomeSummary";

const mockedEnsure = ensureUserRegistered as jest.MockedFunction<typeof ensureUserRegistered>;
const mockedStats = listStudySessionStats as jest.MockedFunction<typeof listStudySessionStats>;
const mockedStreak = getStreak as jest.MockedFunction<typeof getStreak>;

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
    jest.clearAllMocks();
  });

  it("userId 확보 → 통계·스트릭 조회 → success 상태로 화면 모델을 준다", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockResolvedValue(statsResponse);
    mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9 });

    const { result } = renderHook(() => useHomeSummary(), { wrapper: createWrapper() });

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
    // userId를 확보한 뒤에만 통계를 조회한다
    expect(mockedStats).toHaveBeenCalledWith(7, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(mockedStreak).toHaveBeenCalledWith(7);
  });

  it("익명 등록 실패 시 error 상태가 된다", async () => {
    mockedEnsure.mockResolvedValue(null);

    const { result } = renderHook(() => useHomeSummary(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(mockedStats).not.toHaveBeenCalled();
  });

  it("통계 조회 실패 시 error 상태가 되고 retry로 재시도한다", async () => {
    mockedEnsure.mockResolvedValue(7);
    mockedStats.mockRejectedValueOnce(new Error("network"));
    mockedStreak.mockResolvedValue({ streak: 0, maxStreak: 0 });

    const { result } = renderHook(() => useHomeSummary(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe("error"));

    mockedStats.mockResolvedValue(statsResponse);
    if (result.current.status === "error") {
      result.current.retry();
    }
    await waitFor(() => expect(result.current.status).toBe("success"));
  });
});
