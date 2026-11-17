import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakePointsGateway } from "@/features/points/gateway/createFakePointsGateway";
import type { PointsGateway } from "@/features/points/gateway/PointsGateway";
import { PointsGatewayProvider } from "@/features/points/gateway/PointsGatewayContext";
import { isAdsHiddenHere } from "@/features/points/model/adRegion";
import { isNativeBridgeAvailable } from "@/lib/bridge";
import type * as Bridge from "@/lib/bridge";

import { PointsAccessoriesPage } from "../PointsAccessoriesPage";
import { PointsPage } from "../PointsPage";

vi.mock("@/lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof Bridge>()),
  isNativeBridgeAvailable: vi.fn(() => true),
}));
vi.mock("@/features/points/model/adRegion", () => ({ isAdsHiddenHere: vi.fn(() => false) }));

/** 충전과 광고를 모두 맡을 수 있는 앱의 가짜 경계 */
function gatewayWithAds(balance?: number): PointsGateway {
  return {
    ...createFakePointsGateway("default", balance === undefined ? {} : { balance }),
    capabilities: {
      earn: true,
      history: true,
      charge: true,
      ads: true,
      storeItems: true,
      restore: true,
    },
  };
}

function renderAt(path: string, element: ReactElement, gateway: PointsGateway) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PointsGatewayProvider gateway={gateway} userId={7}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={path.split("?")[0]} element={element} />
          </Routes>
        </MemoryRouter>
      </PointsGatewayProvider>
    </QueryClientProvider>,
  );
}

const adTile = () => screen.queryByText("광고 보기");

async function openInsufficientSheet() {
  renderAt("/points/accessories", <PointsAccessoriesPage />, gatewayWithAds(100));
  await userEvent.click(await screen.findByRole("button", { name: "600P로 구매" }));
  const sheet = await screen.findByRole("dialog");
  // 미션 줄은 지역과 관계없이 그려지므로 창이 다 그려졌는지를 이 줄로 기다린다.
  await within(sheet).findByText("미션 보기");
  return sheet;
}

beforeEach(() => {
  vi.mocked(isNativeBridgeAvailable).mockReturnValue(true);
  vi.mocked(isAdsHiddenHere).mockReturnValue(false);
});

describe("광고 입구를 숨기는 지역", () => {
  it("숨기지 않는 지역의 받기 탭에는 광고 타일이 있다", async () => {
    renderAt("/points?tab=earn", <PointsPage />, gatewayWithAds());
    await screen.findByText("출석");
    expect(adTile()).toBeInTheDocument();
  });

  it("숨기는 지역의 받기 탭에는 광고 타일을 그리지 않고 출석 줄과 충전 칸은 남긴다", async () => {
    vi.mocked(isAdsHiddenHere).mockReturnValue(true);
    renderAt("/points?tab=earn", <PointsPage />, gatewayWithAds());
    await screen.findByText("출석");
    expect(adTile()).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^보기/ })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /500P 충전/ })).toBeInTheDocument();
  });

  it("숨기는 지역은 앱 밖에서도 광고 타일의 앱에서 열기 버튼을 그리지 않는다", async () => {
    vi.mocked(isNativeBridgeAvailable).mockReturnValue(false);
    vi.mocked(isAdsHiddenHere).mockReturnValue(true);
    renderAt("/points?tab=earn", <PointsPage />, gatewayWithAds());
    await screen.findByText("출석");
    expect(adTile()).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "앱에서 열기" })).toHaveLength(1);
  });

  it("숨기지 않는 지역의 모자람 창에는 광고 줄이 있다", async () => {
    const sheet = await openInsufficientSheet();
    expect(within(sheet).getByText(/광고 보고/)).toBeInTheDocument();
  });

  it("숨기는 지역의 모자람 창에는 광고 줄이 없고 미션과 충전 줄은 남는다", async () => {
    vi.mocked(isAdsHiddenHere).mockReturnValue(true);
    const sheet = await openInsufficientSheet();
    expect(within(sheet).queryByText(/광고 보고/)).not.toBeInTheDocument();
    expect(within(sheet).getByText("미션 보기")).toBeInTheDocument();
    expect(within(sheet).getByText("바로 충전하기")).toBeInTheDocument();
  });
});
