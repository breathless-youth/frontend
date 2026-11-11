import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetAppPointsGatewayForTests } from "@/features/points/gateway/appPointsGateway";
import { __resetPointsForTests } from "@/lib/pointsCapability";
import { getProfile } from "@/lib/profileApi";

import { PointsPage } from "../PointsPage";

vi.mock("@/lib/profileApi", () => ({ getProfile: vi.fn() }));
vi.mock("@/features/login/GroupLoginScreen", () => ({
  GroupLoginScreen: ({ entry }: { entry: string }) => <p>로그인 화면 {entry}</p>,
}));

function renderPoints() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/points?userId=7"]}>
        <Routes>
          <Route path="/points" element={<PointsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("실제 경계의 회원 전용 거절", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    window.history.replaceState(null, "", "/?points=1");
    __resetPointsForTests();
    __resetAppPointsGatewayForTests();
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(getProfile).mockResolvedValue({
      nickname: "열공곰",
      goal: null,
      category: null,
      initial: "열",
      colorIndex: 0,
      profileImageUrl: null,
      loginProvider: "KAKAO",
    });
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
    __resetPointsForTests();
    __resetAppPointsGatewayForTests();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    vi.mocked(getProfile).mockReset();
  });

  it("프로필로는 회원이어도 서버가 403 MEMBER_ONLY를 주면 로그인 화면을 그린다", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ code: "MEMBER_ONLY", message: "member only" }), {
          status: 403,
        }),
    );
    renderPoints();
    expect(await screen.findByText("로그인 화면 points")).toBeInTheDocument();
  });

  it("다른 실패는 로그인 화면 없이 상점의 오류를 보인다", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 500 }));
    renderPoints();
    expect(await screen.findByText("상점을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.queryByText("로그인 화면 points")).not.toBeInTheDocument();
  });
});
