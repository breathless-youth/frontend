import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { createFakePointsGateway } from "@/features/points/gateway/createFakePointsGateway";
import type { PointsGateway } from "@/features/points/gateway/PointsGateway";
import { PointsGatewayProvider } from "@/features/points/gateway/PointsGatewayContext";
import type { PointsScene } from "@/features/points/pointsScenes";

import { PointsAccessoriesPage } from "../PointsAccessoriesPage";
import { PointsHistoryPage } from "../PointsHistoryPage";
import { PointsMascotsPage } from "../PointsMascotsPage";
import { PointsPage } from "../PointsPage";

const STAGE_ONE = { earn: false, history: false, charge: false, ads: false };

/** 1단계 실제 경계처럼 받기·기록·충전·광고가 없는 가짜 경계 */
function stageOne(scene: PointsScene = "default", balance?: number): PointsGateway {
  return {
    ...createFakePointsGateway(scene, balance === undefined ? {} : { balance }),
    capabilities: STAGE_ONE,
  };
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderAt(path: string, element: ReactElement, gateway?: PointsGateway) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const routes = (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path.split("?")[0]} element={element} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
  render(
    <QueryClientProvider client={client}>
      {gateway === undefined ? (
        routes
      ) : (
        <PointsGatewayProvider gateway={gateway} userId={7}>
          {routes}
        </PointsGatewayProvider>
      )}
    </QueryClientProvider>,
  );
}

describe("1단계 경계의 포인트 상점", () => {
  it("포인트 받기 탭 줄 없이 꾸미기 상점만 그린다", async () => {
    renderAt("/points", <PointsPage />, stageOne());
    expect(await screen.findByRole("button", { name: /소품/ })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "포인트 받기" })).not.toBeInTheDocument();
  });

  it("?tab=earn으로 들어와도 상점을 보이고 받기를 묻지 않는다", async () => {
    const gateway = stageOne();
    const earn = vi.spyOn(gateway, "getEarnToday");
    renderAt("/points?tab=earn", <PointsPage />, gateway);
    expect(await screen.findByRole("button", { name: /소품/ })).toBeInTheDocument();
    expect(screen.queryByText("포인트 받기를 불러오지 못했어요")).not.toBeInTheDocument();
    expect(earn).not.toHaveBeenCalled();
  });

  it("포인트 기록 주소는 포인트 상점으로 돌려보낸다", async () => {
    const gateway = stageOne();
    const history = vi.spyOn(gateway, "getHistory");
    renderAt("/points/history?userId=7", <PointsHistoryPage />, gateway);
    expect(await screen.findByTestId("where")).toHaveTextContent("/points?userId=7");
    expect(history).not.toHaveBeenCalled();
  });

  it("모자람 창은 공부 안내와 확인 버튼만 보이고 받기·충전을 묻지 않는다", async () => {
    const gateway = stageOne("default", 100);
    const earn = vi.spyOn(gateway, "getEarnToday");
    const packs = vi.spyOn(gateway, "getChargePacks");
    renderAt("/points/accessories", <PointsAccessoriesPage />, gateway);
    await userEvent.click(await screen.findByRole("button", { name: "600P로 구매" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("왕관을 구매하려면 500P가 더 필요해요")).toBeInTheDocument();
    expect(within(sheet).getByText("30분 공부할 때마다 +10P")).toBeInTheDocument();
    expect(within(sheet).queryByText("미션 보기")).not.toBeInTheDocument();
    expect(within(sheet).queryByText(/광고 보고/)).not.toBeInTheDocument();
    expect(within(sheet).queryByText("바로 충전하기")).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "확인" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(earn).not.toHaveBeenCalled();
    expect(packs).not.toHaveBeenCalled();
  });

  it("받기 탭이 있는 경계의 모자람 창에는 미션 줄이 있고 공부 안내는 없다", async () => {
    renderAt(
      "/points/accessories",
      <PointsAccessoriesPage />,
      createFakePointsGateway("default", { balance: 100 }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "600P로 구매" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("미션 보기")).toBeInTheDocument();
    expect(within(sheet).queryByText("30분 공부할 때마다 +10P")).not.toBeInTheDocument();
  });
});

describe("새 마스코트 축하", () => {
  it("여럿이 새로 열렸으면 해금 기준이 가장 큰 것을 축하하고, 닫으면 본 것으로 적는다", async () => {
    const gateway = createFakePointsGateway("newMascot");
    const seen = vi.spyOn(gateway, "markUnlocksSeen");
    renderAt("/points/mascots", <PointsMascotsPage />, gateway);
    expect(await screen.findByRole("img", { name: "스톱워치 마스코트" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "나중에" }));
    expect(seen).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("누적 순공")).toBeInTheDocument();
  });

  it("이 마스코트로 바꾸면 고르고 본 것으로 적는다", async () => {
    const gateway = createFakePointsGateway("newMascot");
    const seen = vi.spyOn(gateway, "markUnlocksSeen");
    const select = vi.spyOn(gateway, "selectMascot");
    renderAt("/points/mascots", <PointsMascotsPage />, gateway);
    await userEvent.click(await screen.findByRole("button", { name: "이 마스코트로 바꾸기" }));
    expect(seen).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith("stopwatch");
  });

  it("새로 열린 마스코트가 없으면 축하하지 않고 본 것으로 적지 않는다", async () => {
    const gateway = createFakePointsGateway("default");
    const seen = vi.spyOn(gateway, "markUnlocksSeen");
    renderAt("/points/mascots", <PointsMascotsPage />, gateway);
    expect(await screen.findByText("누적 순공")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "나중에" })).not.toBeInTheDocument();
    expect(seen).not.toHaveBeenCalled();
  });
});
