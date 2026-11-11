import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakePointsGateway } from "@/features/points/gateway/createFakePointsGateway";
import { PointsGatewayProvider } from "@/features/points/gateway/PointsGatewayContext";
import { __resetAppPointsGatewayForTests } from "@/features/points/gateway/appPointsGateway";
import { __resetPointsForTests } from "@/lib/pointsCapability";
import { getProfile } from "@/lib/profileApi";

import { PointsPage } from "../PointsPage";

vi.mock("@/lib/profileApi", () => ({ getProfile: vi.fn() }));
vi.mock("@/features/login/GroupLoginScreen", () => ({
  GroupLoginScreen: ({ entry }: { entry: string }) => <p>로그인 화면 {entry}</p>,
}));

function setFlag(on: boolean) {
  window.history.replaceState(null, "", on ? "/?points=1&pointsMock=default" : "/");
  __resetPointsForTests();
  __resetAppPointsGatewayForTests();
}

function renderAt(path: string, wrap: (ui: ReactElement) => ReactElement = (ui) => ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/points" element={wrap(<PointsPage />)} />
          <Route path="/home" element={<p>홈</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function signIn(loginProvider: "KAKAO" | null) {
  vi.mocked(getProfile).mockResolvedValue({
    nickname: "열공곰",
    goal: null,
    category: null,
    initial: "열",
    colorIndex: 0,
    profileImageUrl: null,
    loginProvider,
  });
}

beforeEach(() => {
  signIn("KAKAO");
  setFlag(true);
});

afterEach(() => {
  setFlag(false);
  vi.mocked(getProfile).mockReset();
});

describe("PointsPage", () => {
  it("플래그가 꺼지면 홈으로 돌아간다", () => {
    setFlag(false);
    renderAt("/points?userId=7");
    expect(screen.getByText("홈")).toBeInTheDocument();
  });

  it("비회원이면 상점 대신 로그인 화면을 그린다", async () => {
    signIn(null);
    renderAt("/points?userId=7");
    expect(await screen.findByText("로그인 화면 points")).toBeInTheDocument();
    expect(screen.queryByText("포인트 상점")).not.toBeInTheDocument();
  });

  it("신원이 없으면 로그인 화면을 그린다", () => {
    renderAt("/points");
    expect(screen.getByText("로그인 화면 points")).toBeInTheDocument();
  });

  it("처음에는 꾸미기 상점 탭을 고르고 잔액을 보인다", async () => {
    renderAt("/points?userId=7");
    expect(await screen.findByRole("tab", { name: "꾸미기 상점" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByText("1,240P")).toBeInTheDocument();
  });

  it("탭 버튼은 손가락으로 누르기 넉넉한 높이다", async () => {
    renderAt("/points?userId=7");
    for (const tab of await screen.findAllByRole("tab")) {
      expect(tab).toHaveClass("min-h-11");
    }
  });

  it("?tab=earn이면 포인트 받기 탭을 고른다", async () => {
    renderAt("/points?userId=7&tab=earn");
    expect(await screen.findByRole("tab", { name: "포인트 받기" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("탭을 누르면 포인트 받기로 바뀐다", async () => {
    renderAt("/points?userId=7");
    await userEvent.click(await screen.findByRole("tab", { name: "포인트 받기" }));
    expect(screen.getByRole("tab", { name: "포인트 받기" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("상점을 받지 못하면 오류와 다시 시도를 보인다", async () => {
    renderAt("/points", (ui) => (
      <PointsGatewayProvider gateway={createFakePointsGateway("loadError")} userId={7}>
        {ui}
      </PointsGatewayProvider>
    ));
    expect(await screen.findByText("상점을 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    expect(screen.getByText("–P")).toBeInTheDocument();
  });
});
