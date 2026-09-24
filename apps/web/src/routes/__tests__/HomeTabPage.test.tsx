import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SessionRecoveryResponse } from "@focusmakers/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as ReactRouterDom from "react-router-dom";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import type * as TokenSourceModule from "@/lib/auth/tokenSource";
import type { TokenSource } from "@/lib/auth/tokenSource";

import {
  createMemoryOnboardingGuideStore,
  resetOnboardingGuideStore,
  setOnboardingGuideStore,
} from "@/features/onboarding/onboardingGuideStore";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { getStreak, listStudySessionStats } from "@/lib/statsApi";
import { todayLabel } from "@/features/home/homeFormat";
import { HomeTabPage } from "@/routes/HomeTabPage";

/** 옛 세션 마감은 자기 테스트가 따로 있다 — 여기서는 결과만 조작한다. */
const closeStaleSession = vi.hoisted(() =>
  vi.fn<() => Promise<SessionRecoveryResponse | null>>(() => Promise.resolve(null)),
);

vi.mock("@/features/study-session/closeStaleSession", () => ({ closeStaleSession }));

const analytics = vi.hoisted(() => ({ trackFocusStartTapped: vi.fn() }));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackFocusStartTapped: analytics.trackFocusStartTapped,
}));

vi.mock("@/lib/statsApi", () => ({
  listStudySessionStats: vi.fn(),
  getStreak: vi.fn(),
}));

vi.mock("@/lib/ddayApi", () => ({
  getDday: vi.fn(() => Promise.resolve(null)),
  putDday: vi.fn(),
  deleteDday: vi.fn(),
}));

/** 기본은 출처 없음(구 앱·브라우저 단독). D-Day 블록 테스트만 가짜 출처를 끼운다. */
const tokenSourceMock = vi.hoisted(() => ({ source: null as TokenSource | null }));

vi.mock("@/lib/auth/tokenSource", async (importOriginal) => ({
  ...(await importOriginal<typeof TokenSourceModule>()),
  getTokenSource: () => tokenSourceMock.source,
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
          <Route path="/social" element={<LocationProbe testId="social-stub" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("HomeTabPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closeStaleSession.mockResolvedValue(null);
    localStorage.clear();
  });

  it("성공 시 순공시간·집중률·스탯 카드를 보여준다", async () => {
    mockedStats.mockResolvedValue(statsResponse);
    mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });

    renderHome();

    await waitFor(() => expect(screen.getByText("77%")).toBeInTheDocument());
    expect(screen.getByText("오늘 순공시간")).toBeInTheDocument();
    expect(screen.getByText("집중률")).toBeInTheDocument();
    expect(screen.getByText("총 공부시간")).toBeInTheDocument();
    expect(screen.getByText("2시간")).toBeInTheDocument();
    expect(screen.getByText("최대 집중시간")).toBeInTheDocument();
    expect(screen.getByText("52분")).toBeInTheDocument();
    expect(screen.getByText("3일 연속 공부 중")).toBeInTheDocument();
  });

  it("조회 실패 시 오류 상태와 다시 시도를 보여준다", async () => {
    mockedStats.mockRejectedValue(new Error("network"));
    mockedStreak.mockRejectedValue(new Error("network"));

    renderHome();

    await waitFor(() => expect(screen.getByText("기록을 불러오지 못했어요")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });

  it("스트릭 0일이면 0일 연속 공부 중으로 보여준다 — 기록 탭 배너와 같은 템플릿", async () => {
    mockedStats.mockResolvedValue(statsResponse);
    mockedStreak.mockResolvedValue({ streak: 0, maxStreak: 0, studiedDatesInRange: [] });

    renderHome();

    await waitFor(() => expect(screen.getByText("0일 연속 공부 중")).toBeInTheDocument());
  });

  it("userId가 없으면 데이터 조회 없이 단독 모드 안내만 보여준다", () => {
    renderHome("/home");

    expect(screen.getByText(/기기 등록 전/)).toBeInTheDocument();
    expect(mockedStats).not.toHaveBeenCalled();
  });

  describe("복구 안내 모달", () => {
    const RECOVERED = {
      statDate: "2026-08-27",
      startedAt: "2026-08-27T12:03:00Z",
      endedAt: "2026-08-27T13:48:00Z",
      studySec: 6300,
      focusSec: 5040,
    };

    /** 네이티브가 주입하는 것과 같은 경로로 앱 실행 신호를 흘린다. */
    function emitAppLaunched() {
      const receiver = (
        globalThis as unknown as Record<string, ((raw: string) => void) | undefined>
      )[NATIVE_MESSAGE_ENTRY];
      receiver?.('{"type":"app-launched","atMs":1}');
    }

    it("서버가 대신 확정한 기록이 있으면 모달이 뜬다", async () => {
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });
      closeStaleSession.mockResolvedValue(RECOVERED);

      renderHome();
      emitAppLaunched();

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });
      expect(screen.getByText("저장되지 않은 기록을 복구했어요")).toBeInTheDocument();
      expect(screen.getByText("1시간 24분")).toBeInTheDocument();
    });

    it("확인을 누르면 닫힌다", async () => {
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });
      closeStaleSession.mockResolvedValue(RECOVERED);

      renderHome();
      emitAppLaunched();
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "확인" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("ⓘ를 누르면 연속 공부 기준 안내가 열린다 — 터치에서도 탭 한 번으로", async () => {
    mockedStats.mockResolvedValue(statsResponse);
    mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });

    renderHome();

    await waitFor(() => expect(screen.getByText("3일 연속 공부 중")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "연속 공부 기준 안내" }));
    expect(
      await screen.findByText("하루 10분 이상 공부하면 연속 공부가 이어져요", {
        selector: "[data-state]",
      }),
    ).toBeInTheDocument();
  });

  describe("주간 도트 — 이번 주 공부한 날", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("오늘은 오늘, 공부한 날은 공부함, 나머지는 기록 없음으로 읽힌다", async () => {
      // 2026-07-28 KST 정오(화요일). Date만 가짜로 두어 react-query 타이머는 그대로 돈다.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-07-28T03:00:00Z"));
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({
        streak: 3,
        maxStreak: 9,
        studiedDatesInRange: ["2026-07-26", "2026-07-27"],
      });

      renderHome();

      await waitFor(() => expect(screen.getByText("3일 연속 공부 중")).toBeInTheDocument());
      expect(screen.getByRole("img", { name: "일요일, 공부함" })).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "월요일, 공부함" })).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "화요일, 오늘" })).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "수요일, 기록 없음" })).toBeInTheDocument();
    });
  });

  describe("친구 초대 카드 — 소셜 탭 이동", () => {
    // 웹뷰 테스트가 심은 브리지 전역이 브라우저 단독 테스트로 새면 폴백 경로가 죽는다.
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("웹뷰에서는 navigate-tab 브리지로 네이티브 소셜 탭을 연다 — 웹 라우팅하지 않는다", async () => {
      const postMessage = vi.fn();
      vi.stubGlobal("ReactNativeWebView", { postMessage });
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });

      renderHomeWithRoutes();

      await waitFor(() => expect(screen.getByText("오늘 순공시간")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /친구 초대하여 공부하기/ }));

      expect(postMessage).toHaveBeenCalledWith(
        expect.stringContaining('"type":"navigate-tab","tab":"social"') as unknown as string,
      );
      expect(postMessage).toHaveBeenCalledWith(
        expect.stringContaining('"via":"invite_card"') as unknown as string,
      );
      // 웹 라우터로 /social에 가면 홈 탭 웹뷰 안의 문서만 바뀌어 탭바와 어긋난다.
      expect(screen.queryByTestId("social-stub")).not.toBeInTheDocument();
    });

    it("빠르게 두 번 누르면 navigate-tab을 한 번만 보낸다", async () => {
      const postMessage = vi.fn();
      vi.stubGlobal("ReactNativeWebView", { postMessage });
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });

      renderHomeWithRoutes();

      await waitFor(() => expect(screen.getByText("오늘 순공시간")).toBeInTheDocument());
      const card = screen.getByRole("button", { name: /친구 초대하여 공부하기/ });
      fireEvent.click(card);
      fireEvent.click(card);

      // 마운트 시 나가는 handshake 메시지는 세지 않는다.
      const navigateCalls = postMessage.mock.calls.filter(([raw]) =>
        String(raw).includes('"type":"navigate-tab"'),
      );
      expect(navigateCalls).toHaveLength(1);
    });

    it("브라우저 단독 모드에서는 쿼리를 승계해 웹 /social로 이동한다", async () => {
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });

      renderHomeWithRoutes();

      await waitFor(() => expect(screen.getByText("오늘 순공시간")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /친구 초대하여 공부하기/ }));

      const stub = await screen.findByTestId("social-stub");
      expect(stub.textContent).toBe("/social?userId=7");
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
      fireEvent.click(screen.getByRole("button", { name: "집중 시작" }));

      const stub = await screen.findByTestId("onboarding-guide-stub");
      expect(stub.textContent).toBe("/onboarding-guide?userId=7&entry=focus-start");
      // 분기 계측(BY-616 확장) — 가이드로 갔다는 사실은 autocapture 클릭이 모른다.
      expect(analytics.trackFocusStartTapped).toHaveBeenCalledWith("guide");
    });

    it("가이드를 이미 봤으면(완료) 쿼리를 승계해 세션 라우트로 바로 이동한다", async () => {
      setOnboardingGuideStore(createMemoryOnboardingGuideStore(true));
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });

      renderHomeWithRoutes();

      await waitFor(() => expect(screen.getByText("오늘 순공시간")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "집중 시작" }));

      const stub = await screen.findByTestId("room-stub");
      expect(stub.textContent).toBe("/room/1?userId=7");
      expect(analytics.trackFocusStartTapped).toHaveBeenCalledWith("session");
    });

    it("가이드를 이미 봤을 때 빠르게 두 번 누르면 세션도 한 번만 시작한다", async () => {
      setOnboardingGuideStore(createMemoryOnboardingGuideStore(true));
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });

      renderHomeWithRoutes();

      await waitFor(() => expect(screen.getByText("오늘 순공시간")).toBeInTheDocument());
      const cta = screen.getByRole("button", { name: "집중 시작" });
      fireEvent.click(cta);
      fireEvent.click(cta);

      await screen.findByTestId("room-stub");
      expect(navigateSpy).toHaveBeenCalledTimes(1);
    });

    it("빠르게 두 번 누르면 온보딩 가이드로 한 번만 이동한다(중복 진입 방지, 리뷰 반영)", async () => {
      mockedStats.mockResolvedValue(statsResponse);
      mockedStreak.mockResolvedValue({ streak: 3, maxStreak: 9, studiedDatesInRange: [] });

      renderHomeWithRoutes();

      await waitFor(() => expect(screen.getByText("오늘 순공시간")).toBeInTheDocument());
      const cta = screen.getByRole("button", { name: "집중 시작" });
      fireEvent.click(cta);
      fireEvent.click(cta);

      await screen.findByTestId("onboarding-guide-stub");
      expect(navigateSpy).toHaveBeenCalledTimes(1);
    });
  });
});

describe("HomeTabPage — 좌상단 D-Day", () => {
  afterEach(() => {
    tokenSourceMock.source = null;
  });

  it("토큰 출처가 없는 문서에는 로고와 날짜가 남는다", async () => {
    mockedStats.mockResolvedValue(statsResponse);
    mockedStreak.mockResolvedValue({ streak: 0, maxStreak: 0, studiedDatesInRange: [] });
    renderHome();

    expect(
      await screen.findByRole("heading", { level: 1, name: "FocusMakers" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "D-Day 설정" })).not.toBeInTheDocument();
  });

  it("토큰 출처가 있는데 첫 토큰이 아직이면 구 헤더 대신 스켈레톤이다", async () => {
    tokenSourceMock.source = {
      getUserId: () => null,
      getAccessToken: () => null,
      hasSettled: () => false,
      subscribe: () => () => {},
    } as unknown as TokenSource;
    renderHome("/home");

    expect(await screen.findByTestId("home-header-pending")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 1, name: "FocusMakers" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "D-Day 설정" })).not.toBeInTheDocument();
  });

  it("토큰 문서면 좌상단이 D-Day 블록이 된다", async () => {
    tokenSourceMock.source = {
      getUserId: () => 7,
      getAccessToken: () => "token",
      hasSettled: () => true,
      subscribe: () => () => {},
    } as unknown as TokenSource;
    mockedStats.mockResolvedValue(statsResponse);
    mockedStreak.mockResolvedValue({ streak: 0, maxStreak: 0, studiedDatesInRange: [] });
    renderHome("/home");

    expect(await screen.findByRole("button", { name: "D-Day 설정" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 1, name: "FocusMakers" }),
    ).not.toBeInTheDocument();
    // 시안대로 헤더는 D-Day 블록 하나다 — 오른쪽 날짜는 구 문서에만 있다
    expect(screen.queryByText(todayLabel())).not.toBeInTheDocument();
  });
});
