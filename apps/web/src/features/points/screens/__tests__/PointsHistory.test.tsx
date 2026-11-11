import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { PointsHistoryPage } from "@/routes/PointsHistoryPage";

import { createFakePointsGateway } from "../../gateway/createFakePointsGateway";
import { PointsGatewayProvider } from "../../gateway/PointsGatewayContext";
import type { PointsScene } from "../../fixtures";
import { PointsHistoryScreen } from "../PointsHistoryScreen";

function renderPage(scene: PointsScene) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PointsGatewayProvider gateway={createFakePointsGateway(scene)} userId={7}>
        <MemoryRouter initialEntries={["/points/history"]}>
          <Routes>
            <Route path="/points/history" element={<PointsHistoryPage />} />
            <Route path="/points" element={<p>상점</p>} />
          </Routes>
        </MemoryRouter>
      </PointsGatewayProvider>
    </QueryClientProvider>,
  );
}

describe("포인트 기록", () => {
  it("날짜별로 묶이고 쓴 것을 고르면 음수 항목만 보인다", async () => {
    renderPage("default");
    const today = await screen.findByRole("region", { name: "오늘" });
    expect(within(today).getByText("출석하기")).toBeInTheDocument();
    expect(within(today).getByText("+10P")).toBeInTheDocument();
    expect(within(today).getByText("단추 리본 사기")).toBeInTheDocument();
    expect(screen.getAllByRole("region").length).toBeGreaterThanOrEqual(3);

    await userEvent.click(screen.getByRole("button", { name: "쓴 것" }));
    expect(await screen.findByText("-200P")).toBeInTheDocument();
    expect(screen.queryByText("+10P")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "쓴 것" })).toHaveAttribute("aria-pressed", "true");
  });

  it("기록이 없으면 안내와 포인트 받으러 가기를 보이고 누르면 받기 탭으로 간다", async () => {
    renderPage("empty");
    expect(await screen.findByText("아직 포인트 기록이 없어요")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "포인트 받으러 가기" }));
    expect(await screen.findByText("상점")).toBeInTheDocument();
  });

  it("불러오지 못하면 다시 시도를 보인다", async () => {
    renderPage("loadError");
    expect(await screen.findByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });
});

describe("PointsHistoryScreen", () => {
  it("고른 종류를 알리고 누른 종류를 넘긴다", async () => {
    const onFilter = vi.fn();
    render(<PointsHistoryScreen entries={[]} filter="all" onFilter={onFilter} onEarn={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "받은 것" }));
    expect(onFilter).toHaveBeenCalledWith("earned");
  });
});
