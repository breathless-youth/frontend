import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as userIdModule from "@/lib/userId";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetPointsForTests } from "@/lib/pointsCapability";
import { homeMission } from "@/test/homeMissionFixtures";
import { plannerDay } from "@/test/plannerFixtures";

import { HomeV3Entry } from "../HomeV3Entry";
import type { HomeV3Gateway } from "../HomeV3Gateway";
import { homeDateLabel } from "../homeV3Model";

vi.mock("@/lib/userId", async (original) => ({
  ...(await original<typeof userIdModule>()),
  assertCurrentUserId: vi.fn(),
}));
vi.mock("../useHomeDay", () => ({
  useHomeDay: () => ({ dateKey: "2026-11-07", timeZone: "Asia/Seoul" }),
}));
vi.mock("@/lib/subjectApi", () => ({ listSubjects: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/statsApi", () => ({
  listStudySessionStats: vi
    .fn()
    .mockResolvedValue({ totalStudySec: 0, totalFocusSec: 0, focusRate: 0 }),
  getStreak: vi.fn().mockResolvedValue({ streak: 0, maxStreak: 0, studiedDatesInRange: [] }),
}));
vi.mock("@/features/home/useHomeStudyStatusProperties", () => ({
  useHomeStudyStatusProperties: vi.fn(),
}));
vi.mock("@/features/profile/useTimeZoneSync", () => ({
  syncProfileTimeZone: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/features/planner/useOpenPlanner", () => ({ useOpenPlanner: () => vi.fn() }));
vi.mock("@/features/timelapse/timelapseQueries", () => ({
  recentTimelapsesQuery: () => ({ queryKey: ["timelapse", "recent"], queryFn: async () => [] }),
}));
vi.mock("@/features/app-lock/appLockCapability", () => ({ hasAppLockCapability: () => false }));
vi.mock("@/features/study-session/vision/prefetchVisionAssets", () => ({
  prefetchVisionAssets: vi.fn(),
}));
vi.mock("@/routes/lazyRoutes", () => ({ prefetchTimelapsesPage: vi.fn() }));

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderHome() {
  const gateway: HomeV3Gateway = {
    readMission: vi.fn().mockResolvedValue(homeMission(0, 0)),
    acknowledgeMission: vi.fn(),
    readPlannerDay: vi.fn().mockResolvedValue(
      plannerDay({
        date: "2026-11-07",
        goal: { goalSec: null, individualGoalSec: null, defaultGoalSec: null },
      }),
    ),
    saveDateGoal: vi.fn(),
    saveDefaultGoal: vi.fn(),
    startStudy: vi.fn(),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/home"]}>
        <Routes>
          <Route
            path="/home"
            element={<HomeV3Entry userId={7} gateway={gateway} onOverlayChange={vi.fn()} />}
          />
          <Route path="/points" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setFlag(on: boolean) {
  window.history.replaceState(null, "", on ? "/?points=1" : "/");
  __resetPointsForTests();
}

beforeEach(() => localStorage.clear());
afterEach(() => setFlag(false));

describe("홈 머리말의 포인트 알약", () => {
  it("플래그가 켜지면 날짜 자리에 잔액 알약이 보이고 누르면 포인트 화면으로 간다", async () => {
    setFlag(true);
    renderHome();
    const pill = await screen.findByRole("button", { name: "보유 포인트 1,240P" });
    expect(screen.queryByText(homeDateLabel("2026-11-07", "ko"))).not.toBeInTheDocument();
    await userEvent.click(pill);
    expect(await screen.findByTestId("where")).toHaveTextContent("/points");
  });

  it("플래그가 꺼지면 날짜가 그대로 보인다", async () => {
    setFlag(false);
    renderHome();
    expect(await screen.findByText(homeDateLabel("2026-11-07", "ko"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /보유 포인트/ })).not.toBeInTheDocument();
  });
});
