import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as userIdModule from "@/lib/userId";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetAppPointsGatewayForTests } from "@/features/points/gateway/appPointsGateway";
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

function renderHome(overrides: Partial<HomeV3Gateway> = {}) {
  const gateway: HomeV3Gateway = {
    readMission: vi.fn().mockResolvedValue(homeMission(0, 0)),
    acknowledgeMission: vi.fn(),
    claimMissionReward: vi.fn(),
    readPlannerDay: vi.fn().mockResolvedValue(
      plannerDay({
        date: "2026-11-07",
        goal: { goalSec: null, individualGoalSec: null, defaultGoalSec: null },
      }),
    ),
    saveDateGoal: vi.fn(),
    saveDefaultGoal: vi.fn(),
    startStudy: vi.fn(),
    ...overrides,
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
  return gateway;
}

function setFlag(on: boolean) {
  window.history.replaceState(null, "", on ? "/?points=1&pointsMock=default" : "/");
  __resetPointsForTests();
  __resetAppPointsGatewayForTests();
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

  it("서버가 회원 전용이라고 거절하면 알약을 숨기고 날짜를 보인다", async () => {
    window.history.replaceState(null, "", "/?points=1");
    __resetPointsForTests();
    __resetAppPointsGatewayForTests();
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ code: "MEMBER_ONLY", message: "member only" }), {
          status: 403,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      renderHome();
      expect(await screen.findByText(homeDateLabel("2026-11-07", "ko"))).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /보유 포인트/ })).not.toBeInTheDocument();
      expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/api/points"))).toBe(
        true,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("시작 미션 보상 받기", () => {
  // 목표 창은 늦게 불러오는 부품이라, 창이 뜨는지를 시간 안에 볼 수 있게 미리 불러 둔다.
  beforeEach(async () => {
    await import("../HomeGoalSheet");
  });

  it("띠가 바뀌지 않은 평소에는 설정하기로 목표 창이 열린다", async () => {
    setFlag(true);
    renderHome({ readMission: vi.fn().mockResolvedValue(homeMission(2, 300)) });
    await userEvent.click(await screen.findByRole("button", { name: "설정하기" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("받기를 연달아 눌러도 보상은 한 번만 받고 그 자리에 나타난 목표 버튼으로 목표 창이 열리지 않는다", async () => {
    setFlag(true);
    const gateway = renderHome({
      readMission: vi.fn().mockResolvedValue({ ...homeMission(2, 300), claimablePoints: 150 }),
      claimMissionReward: vi.fn().mockResolvedValue({ granted: true, points: 150, balance: 1390 }),
    });

    await userEvent.click(await screen.findByRole("button", { name: "받기" }));
    // 보상을 받으면 같은 자리에 목표 띠의 버튼이 나타나고, 연달아 누른 두 번째 탭이 여기에 닿는다.
    await userEvent.click(await screen.findByRole("button", { name: "설정하기" }));

    expect(gateway.claimMissionReward).toHaveBeenCalledTimes(1);
    await expect(screen.findByRole("dialog", undefined, { timeout: 300 })).rejects.toThrow();
  });

  it("보상을 받으면 알림 없이 머리말 잔액 알약 옆에 받은 금액을 보인다", async () => {
    setFlag(true);
    renderHome({
      readMission: vi.fn().mockResolvedValue({ ...homeMission(2, 300), claimablePoints: 150 }),
      claimMissionReward: vi.fn().mockResolvedValue({ granted: true, points: 150, balance: 1390 }),
    });
    await screen.findByRole("button", { name: "보유 포인트 1,240P" });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    await userEvent.click(await screen.findByRole("button", { name: "받기" }));

    expect(await screen.findByText("+150P")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("150포인트 받음");
    expect(screen.getByRole("button", { name: "보유 포인트 1,390P" })).toBeInTheDocument();
  });
});
