import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type * as TokenSourceModule from "@/lib/auth/tokenSource";
import type { TokenSource } from "@/lib/auth/tokenSource";
import i18n from "@/lib/i18n";
import { HomeTabPage } from "@/routes/HomeTabPage";
import { homeMission } from "@/test/homeMissionFixtures";
import { plannerDay } from "@/test/plannerFixtures";

vi.mock("@/lib/profileApi", () => ({ updateProfile: vi.fn(async () => ({})) }));
vi.mock("@/lib/homeMissionApi", () => ({
  getHomeMission: vi.fn(async () => homeMission(0, 0, false)),
}));
vi.mock("@/lib/plannerApi", () => ({
  getPlannerDay: vi.fn(async () => plannerDay()),
  getPlannerCarryover: vi.fn(async () => []),
}));
vi.mock("@/lib/subjectApi", () => ({ listSubjects: vi.fn(async () => []) }));

vi.mock("@/features/study-session/closeStaleSession", () => ({
  closeStaleSession: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/lib/statsApi", () => ({
  listStudySessionStats: vi.fn(() =>
    Promise.resolve({
      sessions: [],
      sessionCount: 1,
      totalStudySec: 14520,
      totalFocusSec: 5520,
      longestFocusSec: 3120,
      focusRate: 76.7,
      totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, SLEEP: 0, PAUSE: 0 },
      studiedDatesInMonth: [],
    }),
  ),
  getStreak: vi.fn(() => Promise.resolve({ streak: 3, maxStreak: 9, studiedDatesInRange: [] })),
}));
vi.mock("@/lib/ddayApi", () => ({
  getDday: vi.fn(() => Promise.resolve({ title: "SAT", targetDate: "2099-11-18" })),
  putDday: vi.fn(),
  deleteDday: vi.fn(),
}));
vi.mock("@/lib/launchReady", () => ({ signalLaunchReady: vi.fn() }));
vi.mock("@/lib/nativePushPermission", () => ({
  requestPushPermissionOnHomeArrival: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/noticeApi", () => ({ getActiveNotices: vi.fn(() => Promise.resolve([])) }));
vi.mock("@/lib/rankingApi", () => ({
  getRankingRecordsUnseen: vi.fn(() => Promise.resolve({ total: 0, records: [] })),
  postRankingRecordsSeen: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@/features/study-session/vision/prefetchVisionAssets", () => ({
  prefetchVisionAssets: vi.fn(),
}));
vi.mock("@/routes/lazyRoutes", () => ({ prefetchTimelapsesPage: vi.fn() }));
vi.mock("@/features/timelapse/RecentTimelapses", () => ({ RecentTimelapses: () => null }));

/** 토큰 문서로 열어 D-Day 블록까지 그린다. */
vi.mock("@/lib/auth/tokenSource", async (importOriginal) => ({
  ...(await importOriginal<typeof TokenSourceModule>()),
  getTokenSource: () =>
    ({
      getUserId: () => 7,
      getAccessToken: async () => "token",
      getCurrentToken: () => "token",
      hasSettled: () => true,
      subscribe: () => () => {},
    }) as unknown as TokenSource,
}));

const HANGUL = /[가-힣]/;

/** 화면 글자와 aria-label을 함께 모은다. 스크린리더가 읽는 이름도 영어여야 한다. */
function visibleText(container: HTMLElement): string {
  const labels = [...container.querySelectorAll("[aria-label]")].map((el) =>
    el.getAttribute("aria-label"),
  );
  return [container.textContent, ...labels].join("\n");
}

afterEach(async () => {
  await i18n.changeLanguage("ko");
});

describe("홈 영어 화면", () => {
  beforeAll(async () => {
    await import("@/features/home-v3/HomeV3Entry");
  });
  it("영어로 바꾸면 홈 탭에 한글이 남지 않는다", async () => {
    await i18n.changeLanguage("en");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/home"]}>
          <HomeTabPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 통계 카드와 D-Day 블록이 다 그려질 때까지 기다린다.
    await screen.findByText("77%");
    await screen.findByTestId("dday-label");

    expect(visibleText(container)).not.toMatch(HANGUL);
  });
});
