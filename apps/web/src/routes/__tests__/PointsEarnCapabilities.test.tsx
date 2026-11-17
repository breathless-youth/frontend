import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakePointsGateway } from "@/features/points/gateway/createFakePointsGateway";
import type { PointsGateway } from "@/features/points/gateway/PointsGateway";
import { PointsGatewayProvider } from "@/features/points/gateway/PointsGatewayContext";
import { isNativeBridgeAvailable } from "@/lib/bridge";
import type * as Bridge from "@/lib/bridge";

import { PointsPage } from "../PointsPage";

vi.mock("@/lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof Bridge>()),
  isNativeBridgeAvailable: vi.fn(() => false),
}));

/** 충전과 광고를 맡을 수 있는지만 바꾼 가짜 경계 */
function gatewayWith(charge: boolean, ads: boolean): PointsGateway {
  return {
    ...createFakePointsGateway("default"),
    capabilities: {
      earn: true,
      history: true,
      charge,
      ads,
      storeItems: charge,
      restore: charge,
    },
  };
}

async function renderEarnTab(input: { inApp: boolean; charge: boolean; ads: boolean }) {
  vi.mocked(isNativeBridgeAvailable).mockReturnValue(input.inApp);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PointsGatewayProvider gateway={gatewayWith(input.charge, input.ads)} userId={7}>
        <MemoryRouter initialEntries={["/points?tab=earn"]}>
          <Routes>
            <Route path="/points" element={<PointsPage />} />
          </Routes>
        </MemoryRouter>
      </PointsGatewayProvider>
    </QueryClientProvider>,
  );
  // 출석 줄은 어느 조합에서나 그려지므로 받기 탭이 다 그려졌는지를 이 줄로 기다린다.
  await screen.findByText("출석");
}

const chargeTitle = () => screen.queryByRole("heading", { name: "포인트 충전" });
const adTile = () => screen.queryByText("광고 보기");
const openInAppCard = () => screen.queryByText("충전과 광고 보상은 앱에서 할 수 있어요");
const openInAppButtons = () => screen.queryAllByRole("button", { name: "앱에서 열기" });
const watchButton = () => screen.queryByRole("button", { name: /^보기/ });

beforeEach(() => {
  vi.mocked(isNativeBridgeAvailable).mockReset();
});

describe("포인트 받기 탭의 충전 칸과 광고 타일", () => {
  it("앱 밖에서는 충전 칸 대신 앱에서 열기 안내를, 광고 타일에는 앱에서 열기 버튼을 보인다", async () => {
    await renderEarnTab({ inApp: false, charge: false, ads: false });
    expect(openInAppCard()).toBeInTheDocument();
    expect(adTile()).toBeInTheDocument();
    expect(openInAppButtons()).toHaveLength(2);
    expect(chargeTitle()).not.toBeInTheDocument();
    expect(watchButton()).not.toBeInTheDocument();
    expect(screen.queryByText(/₩/)).not.toBeInTheDocument();
  });

  it("충전과 광고를 모르는 예전 앱에서는 충전 칸도 광고 타일도 안내도 그리지 않는다", async () => {
    await renderEarnTab({ inApp: true, charge: false, ads: false });
    expect(chargeTitle()).not.toBeInTheDocument();
    expect(adTile()).not.toBeInTheDocument();
    expect(openInAppCard()).not.toBeInTheDocument();
    expect(openInAppButtons()).toHaveLength(0);
    expect(screen.queryByText(/₩/)).not.toBeInTheDocument();
  });

  it("충전만 맡을 수 있는 앱에서는 충전 칸만 그린다", async () => {
    await renderEarnTab({ inApp: true, charge: true, ads: false });
    expect(await screen.findByRole("button", { name: /500P 충전/ })).toBeInTheDocument();
    expect(chargeTitle()).toBeInTheDocument();
    expect(adTile()).not.toBeInTheDocument();
    expect(openInAppButtons()).toHaveLength(0);
  });

  it("광고만 맡을 수 있는 앱에서는 광고 타일만 그린다", async () => {
    await renderEarnTab({ inApp: true, charge: false, ads: true });
    expect(adTile()).toBeInTheDocument();
    expect(watchButton()).toBeInTheDocument();
    expect(chargeTitle()).not.toBeInTheDocument();
    expect(openInAppCard()).not.toBeInTheDocument();
    expect(openInAppButtons()).toHaveLength(0);
  });

  it("둘 다 맡을 수 있는 앱에서는 충전 칸과 광고 타일을 모두 그린다", async () => {
    await renderEarnTab({ inApp: true, charge: true, ads: true });
    expect(await screen.findByRole("button", { name: /500P 충전/ })).toBeInTheDocument();
    expect(chargeTitle()).toBeInTheDocument();
    expect(watchButton()).toBeInTheDocument();
    expect(openInAppCard()).not.toBeInTheDocument();
  });
});
