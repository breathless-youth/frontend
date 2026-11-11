import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { createFakePointsGateway } from "../../gateway/createFakePointsGateway";
import type { PointsGateway } from "../../gateway/PointsGateway";
import { PointsGatewayProvider } from "../../gateway/PointsGatewayContext";
import { PointsShopRoute } from "../../PointsShopRoute";
import { AccessoryShopScreen } from "../AccessoryShopScreen";

function renderScreen(gateway: PointsGateway) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PointsGatewayProvider gateway={gateway} userId={1}>
        <MemoryRouter initialEntries={["/points/accessories"]}>
          <Routes>
            <Route
              path="/points/accessories"
              element={
                <PointsShopRoute title="소품">
                  {({ data, balance, back }) => (
                    <AccessoryShopScreen data={data} balance={balance} onBack={back} />
                  )}
                </PointsShopRoute>
              }
            />
            <Route path="/points/mascots" element={<p>마스코트 화면</p>} />
          </Routes>
        </MemoryRouter>
      </PointsGatewayProvider>
    </QueryClientProvider>,
  );
}

describe("AccessoryShopScreen", () => {
  it("잠긴 마스코트는 자물쇠와 함께 보이고, 고르면 잠김 안내와 마스코트 모으기가 나온다", async () => {
    renderScreen(createFakePointsGateway("default"));
    expect(await screen.findByRole("button", { name: "램프, 아직 잠겨 있어요" })).toBeVisible();
    expect(screen.getByRole("button", { name: "스톱워치, 고른 마스코트" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "램프, 아직 잠겨 있어요" }));
    expect(screen.getByText("램프는 아직 잠겨 있어요")).toBeVisible();
    expect(screen.getByText("순공 4시간 12분 더 하면 열려요.")).toBeVisible();
    expect(screen.queryByRole("group", { name: "소품 고르기" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "마스코트 모으기" }));
    expect(screen.getByText("마스코트 화면")).toBeVisible();
  });

  it("고른 소품에 따라 아래 버튼 문구가 바뀐다", async () => {
    renderScreen(createFakePointsGateway("default"));
    expect(await screen.findByRole("button", { name: "600P로 구매" })).toBeEnabled();
    expect(screen.getByText("왕관 미리 보기")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "몸 장식" }));
    await userEvent.click(screen.getByRole("button", { name: "단추 리본, 가지고 있어요" }));
    await userEvent.click(screen.getByRole("button", { name: "착용하기" }));
    expect(await screen.findByRole("button", { name: "착용 중" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "머리 위" }));
    await userEvent.click(screen.getByRole("button", { name: "학사모, 순공 100시간 보상" }));
    const reward = screen.getByRole("button", { name: "누적 순공 25 / 100시간" });
    expect(reward).toBeDisabled();
    expect(screen.getByRole("img", { name: "순공 100시간 중 25시간" })).toBeVisible();
  });

  it("벗기 칸을 누르면 그 부위의 착용이 풀린다", async () => {
    renderScreen(createFakePointsGateway("default"));
    await userEvent.click(await screen.findByRole("button", { name: "몸 장식" }));
    await userEvent.click(screen.getByRole("button", { name: "단추 리본, 가지고 있어요" }));
    await userEvent.click(screen.getByRole("button", { name: "착용하기" }));
    await userEvent.click(await screen.findByRole("button", { name: "몸 장식 소품 벗기" }));
    expect(await screen.findByRole("button", { name: "착용하기" })).toBeEnabled();
  });

  it("구매에 성공하면 알림이 뜨고 잔액이 줄고 바로 착용 상태가 된다", async () => {
    renderScreen(createFakePointsGateway("default"));
    await userEvent.click(await screen.findByRole("button", { name: "600P로 구매" }));
    await userEvent.click(await screen.findByRole("button", { name: "구매하기" }));
    expect(await screen.findByRole("status")).toHaveTextContent("왕관을 구매했어요!");
    expect(screen.getByText("640P")).toBeVisible();
    expect(await screen.findByRole("button", { name: "착용 중" })).toBeDisabled();
  });

  it("포인트가 모자라면 구매 확인 대신 모자람 창이 열린다", async () => {
    renderScreen(createFakePointsGateway("default", { balance: 100 }));
    await userEvent.click(await screen.findByRole("button", { name: "600P로 구매" }));
    await waitFor(() =>
      expect(screen.getByText("왕관을 구매하려면 500P가 더 필요해요")).toBeVisible(),
    );
    expect(screen.queryByRole("button", { name: "구매하기" })).not.toBeInTheDocument();
  });
});
