import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { trackPointsSetViewed } from "@/lib/amplitude";
import { PointsAccessoriesPage } from "@/routes/PointsAccessoriesPage";

import { createFakePointsGateway } from "../../gateway/createFakePointsGateway";
import { PointsGatewayProvider } from "../../gateway/PointsGatewayContext";

vi.mock("@/lib/amplitude", async (original) => ({
  ...(await original<object>()),
  trackPointsSetViewed: vi.fn(),
}));

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PointsGatewayProvider gateway={createFakePointsGateway("default")} userId={1}>
        <MemoryRouter initialEntries={["/points/accessories"]}>
          <Routes>
            <Route path="/points/accessories" element={<PointsAccessoriesPage />} />
          </Routes>
        </MemoryRouter>
      </PointsGatewayProvider>
    </QueryClientProvider>,
  );
}

describe("AccessoryShopScreen의 세트 칸", () => {
  it("세트 칩이 맨 앞에 있고 누르기 전에는 안내가 없다", async () => {
    renderScreen();

    const chips = (await screen.findByRole("group", { name: "소품 부위" })).querySelectorAll(
      "button",
    );
    expect(chips[0]).toHaveTextContent("세트");
    expect(screen.queryByText("세트를 입으면 다른 소품은 벗겨져요")).toBeNull();
    expect(trackPointsSetViewed).not.toHaveBeenCalled();
  });

  it("세트 칸을 열면 낱개가 벗겨진다고 알리고 결제 버튼만 보이며 열람을 기록한다", async () => {
    renderScreen();

    await userEvent.click(await screen.findByRole("button", { name: "세트" }));

    expect(screen.getByText("세트를 입으면 다른 소품은 벗겨져요")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /구매하기|앱에서 살 수 있어요/ }),
    ).toBeInTheDocument();
    expect(trackPointsSetViewed).toHaveBeenCalledWith("stopwatch");
  });

  it("결제 버튼 바로 위에 결제·환불 안내가 있고 충전 칸과 같은 안내를 연다", async () => {
    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "세트" }));

    const guide = screen.getByRole("button", { name: "결제·환불 안내" });
    const buy = screen.getByRole("button", { name: /구매하기/ });
    expect(guide.compareDocumentPosition(buy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/App Store|Google Play/)).not.toBeInTheDocument();

    await userEvent.click(guide);
    const sheet = await screen.findByRole("dialog", { name: "결제·환불 안내" });
    expect(
      within(sheet).getByText("세트는 입기 전이면 결제한 뒤 7일 안에 환불을 요청할 수 있어요."),
    ).toBeInTheDocument();
  });
});
