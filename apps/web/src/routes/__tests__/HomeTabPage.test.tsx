import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as ReactRouterDom from "react-router-dom";
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

/**
 * `navigate()` 실제 호출 횟수를 센다(이중 탭 방지 검증용, 리뷰 반영). React가 같은 배치 안의
 * 두 번째 `navigate()` 호출이 만든 중간 상태를 커밋 한 번 없이 덮어쓸 수 있어, 목적지 컴포넌트의
 * 렌더/이펙트 횟수만으로는 실제 호출 횟수를 구분하지 못한다 — 그래서 훅을 감싸 호출 자체를 센다.
 * 라우팅은 실제 `useNavigate()`에 그대로 위임하므로 다른 테스트의 동작은 바뀌지 않는다.
 */
const { navigateSpy } = vi.hoisted(() => ({ navigateSpy: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDom>();
  return {
    ...actual,
    useNavigate: () => {
      const realNavigate = actual.useNavigate();
      const wrapped = (to: unknown, options?: unknown) => {
        navigateSpy(to, options);
        return (realNavigate as (to: unknown, options?: unknown) => void)(to, options);
      };
      return wrapped as typeof realNavigate;
    },
  };
});

const mockedStats = vi.mocked(listStudySessionStats);
const mockedStreak = vi.mocked(getStreak);

/**
 * U2 공지 조회(BY-377)는 statsApi와 달리 모듈 mock 없이 전역 fetch를 탄다.
 * 기본은 빈 목록 — 공지와 무관한 테스트에서 팝업이 홈 위를 덮지 않게 한다.
 */
const mockedFetch = vi.fn();
globalThis.fetch = mockedFetch as unknown as typeof fetch;

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

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
          <Route path="/records" element={<LocationProbe testId="records-stub" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("HomeTabPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockedFetch.mockResolvedValue(jsonResponse(200, []));
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

    await waitFor(() => expect(screen.getByText("오늘 10분이면 시작돼요")).toBeInTheDocument());
  });

  it("업데이트 안내 시트는 기본 상태에서 렌더되지 않는다 (fail-closed 게이트)", async () => {
    mockedStats.mockResolvedValue(statsResponse);
    mockedStreak.mockResolvedValue({ streak: 0, maxStreak: 0, studiedDatesInRange: [] });

    renderHome();

    await waitFor(() => expect(screen.getByText("오늘 순공시간")).toBeInTheDocument());
    expect(screen.queryByTestId("update-notice-sheet")).not.toBeInTheDocument();
  });

  it("활성 공지가 있으면 공지 팝업이 뜬다 — NoticePopupHost 마운트 (BY-377)", async () => {
    mockedStats.mockResolvedValue(statsResponse);
    mockedStreak.mockResolvedValue({ streak: 0, maxStreak: 0, studiedDatesInRange: [] });
    mockedFetch.mockResolvedValue(
      jsonResponse(200, [{ id: 1, title: "새 기능이 나왔어요", content: "본문", imageUrl: null }]),
    );

    renderHome();

    await waitFor(() => expect(screen.getByTestId("notice-popup")).toBeInTheDocument());
    expect(screen.getByText("새 기능이 나왔어요")).toBeInTheDocument();
  });

  it("userId가 없으면 데이터 조회 없이 단독 모드 안내만 보여준다", () => {
    renderHome("/home");

    expect(screen.getByText(/userId 없음/)).toBeInTheDocument();
    expect(mockedStats).not.toHaveBeenCalled();
  });

  describe("연속 공부 카드 — 기록 탭 이동 (Figma Card/Stat 38:86)", () => {
    // 웹뷰 테스트가 심은 브리지 전역이 브라우저 단독 테스트로 새면 폴백 경로가 죽는다.
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("웹뷰에서는 navigate-tab 브리지로 네이티브 탭바를 움직인다 — 웹 라우팅하지 않는다", async () => {
      const postMessage = vi.fn();
      vi.stubGlobal("ReactNativeWebView", { postMessage });
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });

      renderHomeWithRoutes();

      await waitFor(() => expect(screen.getByText("3일째")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /연속 공부/ }));

      expect(postMessage).toHaveBeenCalledWith(
        expect.stringContaining('"type":"navigate-tab"') as unknown as string,
      );
      // 웹 라우터로 /records에 가면 홈 탭 웹뷰 안의 문서만 바뀌어 탭바와 어긋난다.
      expect(screen.queryByTestId("records-stub")).not.toBeInTheDocument();
    });

    it("브라우저 단독 모드에서는 쿼리를 승계해 웹 /records로 이동한다", async () => {
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });

      renderHomeWithRoutes();

      await waitFor(() => expect(screen.getByText("3일째")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /연속 공부/ }));

      const stub = await screen.findByTestId("records-stub");
      expect(stub.textContent).toBe("/records?userId=7");
    });

    it("최장 집중 카드는 버튼이 아니다 — 목적지가 없는 카드를 눌리는 것처럼 만들지 않는다", async () => {
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });

      renderHome();

      await waitFor(() => expect(screen.getByText("52분")).toBeInTheDocument());
      expect(screen.queryByRole("button", { name: /최장 집중/ })).not.toBeInTheDocument();
    });
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

    it("빠르게 두 번 누르면 온보딩 가이드로 한 번만 이동한다(중복 진입 방지, 리뷰 반영)", async () => {
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });

      renderHomeWithRoutes();

      await waitFor(() => expect(screen.getByText("오늘 순공시간")).toBeInTheDocument());
      const cta = screen.getByRole("button", { name: "집중 시작. 누르면 바로 측정이 시작돼요" });
      fireEvent.click(cta);
      fireEvent.click(cta);

      await screen.findByTestId("onboarding-guide-stub");
      expect(navigateSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("가이드 카드 — 다시 보기 (BY-334)", () => {
    it("최초 1회 판정과 무관하게 클릭 시 쿼리를 승계해 온보딩 가이드로 이동한다(entry=home-card)", async () => {
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });

      renderHomeWithRoutes();

      await waitFor(() => expect(screen.getByText("오늘 순공시간")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /공부 측정 가이드/ }));

      const stub = await screen.findByTestId("onboarding-guide-stub");
      expect(stub.textContent).toBe("/onboarding-guide?userId=7&entry=home-card");
    });
  });
});
