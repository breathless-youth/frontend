import type { StudySessionResponse } from "@focusmakers/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakePointsGateway } from "@/features/points/gateway/createFakePointsGateway";
import type { PointsGateway } from "@/features/points/gateway/PointsGateway";
import { PointsGatewayProvider } from "@/features/points/gateway/PointsGatewayContext";
import { usePointsAccess } from "@/features/points/usePointsAccess";
import { __resetAppPointsGatewayForTests } from "@/features/points/gateway/appPointsGateway";
import { __resetPointsForTests } from "@/lib/pointsCapability";

import { ResultPage } from "../ResultPage";

vi.mock("@/features/points/usePointsAccess", () => ({ usePointsAccess: vi.fn() }));
vi.mock("@/features/login/GroupLoginScreen", () => ({
  GroupLoginScreen: () => <p>로그인 화면</p>,
}));
vi.mock("@/lib/statsApi", () => ({
  listStudySessionStats: () => new Promise(() => undefined),
  getStudyDays: () => new Promise(() => undefined),
}));
vi.mock("@/lib/interviewApi", () => ({
  getInterviewStatus: () => new Promise(() => undefined),
}));
vi.mock("@/features/timelapse/ResultTimelapseCard", () => ({ ResultTimelapseCard: () => null }));

function setFlag(on: boolean) {
  window.history.replaceState(null, "", on ? "/?points=1&pointsMock=default" : "/");
  __resetPointsForTests();
  __resetAppPointsGatewayForTests();
}

const session: StudySessionResponse = {
  id: 10,
  userId: 7,
  statDate: "2026-07-25",
  startedAt: new Date(2026, 6, 25, 21, 0).toISOString(),
  endedAt: new Date(2026, 6, 25, 22, 0).toISOString(),
  studySec: 3600,
  focusSec: 3000,
  focusRate: 83,
  events: [],
};

const PATHS = ["/room/7/result", "/social/room/42/result", "/social/groups/10/room/result"];

function renderAt(
  path: string,
  search: string,
  gateway: PointsGateway,
  sessions: StudySessionResponse[] = [session],
) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PointsGatewayProvider gateway={gateway} userId={7}>
        <MemoryRouter initialEntries={[{ pathname: path, search, state: { sessions } }]}>
          <Routes>
            <Route path="/room/:id/result" element={<ResultPage />} />
            <Route path="/social/room/:roomId/result" element={<ResultPage />} />
            <Route path="/social/groups/:groupId/room/result" element={<ResultPage />} />
            <Route path="/points" element={<p>상점 화면</p>} />
          </Routes>
        </MemoryRouter>
      </PointsGatewayProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(usePointsAccess).mockReturnValue({ status: "member", userId: 7 });
  setFlag(true);
});

afterEach(() => {
  setFlag(false);
  vi.mocked(usePointsAccess).mockReset();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("ResultPage 포인트 카드", () => {
  it.each(PATHS)("%s에서 카드가 요약 카드 바로 위에 놓인다", async (path) => {
    renderAt(path, "?userId=7", createFakePointsGateway("default"));
    const card = (await screen.findByText("+20P 받았어요")).closest('[data-slot="card"]');
    expect(card).not.toBeNull();
    const summary = card!.nextElementSibling;
    expect(summary).toHaveTextContent("오늘 누적 순공시간");
  });

  it("세션의 시작 시각을 경계에 넘긴다", async () => {
    const gateway = createFakePointsGateway("default");
    const spy = vi.spyOn(gateway, "getSessionReward");
    renderAt(PATHS[0], "?userId=7", gateway);
    await screen.findByText("+20P 받았어요");
    expect(spy).toHaveBeenCalledWith(session.startedAt);
  });

  it("세션이 여러 개 묶여 오면 가장 이른 시작 시각을 넘긴다", async () => {
    const gateway = createFakePointsGateway("default");
    const spy = vi.spyOn(gateway, "getSessionReward");
    const earlier = {
      ...session,
      id: 9,
      startedAt: new Date(2026, 6, 25, 19, 0).toISOString(),
      endedAt: new Date(2026, 6, 25, 20, 0).toISOString(),
    };
    renderAt(PATHS[0], "?userId=7", gateway, [session, earlier]);
    await screen.findByText("+20P 받았어요");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(earlier.startedAt);
  });

  it("플래그가 꺼지면 카드가 없고 경계도 부르지 않는다", () => {
    setFlag(false);
    const gateway = createFakePointsGateway("default");
    const spy = vi.spyOn(gateway, "getSessionReward");
    renderAt(PATHS[0], "?userId=7", gateway);
    expect(screen.queryByText(/받았어요/)).not.toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([
    ["비회원이거나 확인할 수 없으면", "denied"],
    ["확인하는 중이면", "pending"],
  ] as const)("%s 카드도 로그인 화면도 없다", (_, status) => {
    vi.mocked(usePointsAccess).mockReturnValue({ status });
    renderAt(PATHS[0], "?userId=7", createFakePointsGateway("default"));
    expect(screen.queryByText("로그인 화면")).not.toBeInTheDocument();
    expect(screen.queryByText(/받았어요/)).not.toBeInTheDocument();
  });
});
