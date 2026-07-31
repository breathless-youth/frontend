import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMemoryOnboardingGuideStore,
  resetOnboardingGuideStore,
  setOnboardingGuideStore,
} from "@/features/onboarding/onboardingGuideStore";
import { getStreak, listStudySessionStats } from "@/lib/statsApi";
import { HomeTabPage } from "@/routes/HomeTabPage";

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
  totalFocusSec: 5520, // 1시간 32분
  longestFocusSec: 3120, // 52분
  focusRate: 76.7,
  totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, PAUSE: 0 },
  studiedDatesInMonth: [],
};

function renderHome(path = "/home?userId=7") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <HomeTabPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** 이동한 목적지의 경로+쿼리를 그대로 노출하는 스텁(`OnboardingGuidePage.test.tsx`와 같은 패턴). */
function LocationProbe({ testId }: { testId: string }) {
  const location = useLocation();
  return <div data-testid={testId}>{location.pathname + location.search}</div>;
}

function renderHomeWithRoutes(path = "/home?userId=7") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/home" element={<HomeTabPage />} />
          <Route
            path="/onboarding-guide"
            element={<LocationProbe testId="onboarding-guide-stub" />}
          />
          <Route path="/room/:id" element={<LocationProbe testId="room-stub" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("HomeTabPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("성공 시 순공시간·집중률·스탯 카드를 보여준다", async () => {
    mockedStats.mockResolvedValue(statsResponse);
    mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });

    renderHome();

    await waitFor(() => expect(screen.getByText("77% 집중")).toBeInTheDocument());
    expect(screen.getByText("오늘 순공시간")).toBeInTheDocument();
    expect(screen.getByText("총 공부 2시간 0분")).toBeInTheDocument();
    expect(screen.getByText("3일째")).toBeInTheDocument();
    expect(screen.getByText("52분")).toBeInTheDocument();
  });

  it("조회 실패 시 오류 상태와 다시 시도를 보여준다", async () => {
    mockedStats.mockRejectedValue(new Error("network"));
    mockedStreak.mockRejectedValue(new Error("network"));

    renderHome();

    await waitFor(() => expect(screen.getByText("기록을 불러오지 못했어요")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });

  it("스트릭 0일이면 시작 유도 문구를 보여준다", async () => {
    mockedStats.mockResolvedValue(statsResponse);
    mockedStreak.mockResolvedValue({ streak: 0, maxStreak: 0, studiedDatesInRange: [] });

    renderHome();

    await waitFor(() =>
      expect(screen.getByText("오늘 10분 집중하면 연속 공부가 시작돼요")).toBeInTheDocument(),
    );
  });

  it("업데이트 안내 시트는 기본 상태에서 렌더되지 않는다 (fail-closed 게이트)", async () => {
    mockedStats.mockResolvedValue(statsResponse);
    mockedStreak.mockResolvedValue({ streak: 0, maxStreak: 0, studiedDatesInRange: [] });

    renderHome();

    await waitFor(() => expect(screen.getByText("오늘 순공시간")).toBeInTheDocument());
    expect(screen.queryByTestId("update-notice-sheet")).not.toBeInTheDocument();
  });

  it("userId가 없으면 데이터 조회 없이 단독 모드 안내만 보여준다", () => {
    renderHome("/home");

    expect(screen.getByText(/userId 없음/)).toBeInTheDocument();
    expect(mockedStats).not.toHaveBeenCalled();
  });

  describe("집중 시작 CTA — 온보딩 가이드 배선 (BY-334)", () => {
    beforeEach(() => {
      setOnboardingGuideStore(createMemoryOnboardingGuideStore());
    });

    afterEach(() => {
      resetOnboardingGuideStore();
    });

    it("가이드 미완료면 쿼리를 승계해 온보딩 가이드로 이동한다", async () => {
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });

      renderHomeWithRoutes();

      await waitFor(() => expect(screen.getByText("오늘 순공시간")).toBeInTheDocument());
      fireEvent.click(
        screen.getByRole("button", { name: "집중 시작. 누르면 바로 측정이 시작돼요" }),
      );

      const stub = await screen.findByTestId("onboarding-guide-stub");
      expect(stub.textContent).toBe("/onboarding-guide?userId=7&entry=focus-start");
    });

    it("가이드를 이미 봤으면(완료) 쿼리를 승계해 세션 라우트로 바로 이동한다", async () => {
      setOnboardingGuideStore(createMemoryOnboardingGuideStore(true));
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });

      renderHomeWithRoutes();

      await waitFor(() => expect(screen.getByText("오늘 순공시간")).toBeInTheDocument());
      fireEvent.click(
        screen.getByRole("button", { name: "집중 시작. 누르면 바로 측정이 시작돼요" }),
      );

      const stub = await screen.findByTestId("room-stub");
      expect(stub.textContent).toBe("/room/1?userId=7");
    });
  });
});
