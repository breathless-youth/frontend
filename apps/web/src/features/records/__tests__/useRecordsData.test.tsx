import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudySessionListResponse } from "@focuson/types";
import { getStreak, listStudySessionStats } from "@/lib/statsApi";

import { useRecordsData } from "../useRecordsData";

/**
 * (RN 원본 `apps/mobile/components/records/__tests__/useRecordsData.test.tsx`의
 * "같은 달의 미캐시 날짜를 선택해도 달력 도트가 비지 않는다" 케이스를 웹 훅 시그니처로 이식 —
 * BY-330 리뷰 보강. 웹판은 userId를 인자로 직접 받으므로 등록 쿼리 모킹이 없다.)
 */
vi.mock("@/lib/statsApi", () => ({
  listStudySessionStats: vi.fn(),
  getStreak: vi.fn(),
}));

const mockedStats = vi.mocked(listStudySessionStats);
const mockedStreak = vi.mocked(getStreak);

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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const TODAY_KEY = "2026-07-29";
const MONTH = { year: 2026, month: 7 };

describe("useRecordsData — placeholder 가드(useRecordsData.ts의 !day.isPlaceholderData)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedStreak.mockResolvedValue({ streak: 0, maxStreak: 0, studiedDatesInRange: [] });
  });

  it("같은 달의 미캐시 날짜를 선택해도 이전 날짜 데이터가 새 날짜 아래 보이지 않는다 — pending 유지", async () => {
    const dots = ["2026-07-24", "2026-07-26"];
    let resolveSecond: ((value: StudySessionListResponse) => void) | undefined;
    mockedStats.mockImplementation((_userId, date) => {
      if (date === "2026-07-26") {
        return Promise.resolve(statsResponse(dots));
      }
      // 미캐시 날짜(7/24) 응답을 붙잡아 둔다 — placeholder 유지 중 상태를 검사하기 위함.
      return new Promise<StudySessionListResponse>((resolve) => {
        resolveSecond = resolve;
      });
    });

    const { result, rerender } = renderHook(
      ({ selectedKey }: { selectedKey: string }) =>
        useRecordsData(7, selectedKey, MONTH, TODAY_KEY),
      { wrapper: createWrapper(), initialProps: { selectedKey: "2026-07-26" } },
    );
    await waitFor(() => expect(result.current.day.status).toBe("success"));
    expect(result.current.studiedDates).toEqual(dots);

    rerender({ selectedKey: "2026-07-24" });

    // 도트(studiedDatesInMonth)는 placeholder로 이전 값을 유지해 깜빡이지 않는다.
    expect(result.current.studiedDates).toEqual(dots);
    // 요약·리스트(day)는 placeholder를 success로 취급하지 않는다 — 7/24 응답이 오기 전까지는
    // 7/26 데이터가 "7/24 학습 요약" 제목 아래 새어나오면 안 되므로 pending으로 남는다.
    expect(result.current.day.status).toBe("pending");

    await act(async () => {
      resolveSecond?.(statsResponse(dots));
    });
    await waitFor(() => expect(result.current.day.status).toBe("success"));
  });
});
