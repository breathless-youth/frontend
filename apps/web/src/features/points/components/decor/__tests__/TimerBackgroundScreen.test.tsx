import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { shopQuery } from "@/lib/pointsQueries";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { createFakePointsGateway } from "../../../gateway/createFakePointsGateway";
import { PointsGatewayProvider, usePointsGateway } from "../../../gateway/PointsGatewayContext";
import { TimerBackgroundScreen } from "../../../screens/TimerBackgroundScreen";

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
import { showToast } from "@/lib/toast";

// 실제 라우트처럼 상점 데이터를 다시 받아 화면에 넘긴다.
function Harness() {
  const gateway = usePointsGateway();
  const shop = useQuery(shopQuery(gateway, 7));
  const balance = useQuery({ queryKey: ["b"], queryFn: () => gateway.getBalance() });
  if (!shop.data || balance.data === undefined) return null;
  return <TimerBackgroundScreen data={shop.data} balance={balance.data} onBack={() => {}} />;
}

async function setup(balance = 1240) {
  const gateway = createFakePointsGateway("default", { balance });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PointsGatewayProvider gateway={gateway} userId={7}>
        <MemoryRouter>
          <Harness />
        </MemoryRouter>
      </PointsGatewayProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole("button", { name: "전체" });
  return { gateway };
}

const tile = (name: string) => screen.getByRole("button", { name: new RegExp(name) });

describe("TimerBackgroundScreen", () => {
  it("분류 칩을 누르면 그 분류의 배경만 보인다", async () => {
    await setup();
    expect(screen.getByText("바닷가")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "계절" }));
    expect(screen.getByText("모닥불")).toBeInTheDocument();
    expect(screen.getByText("눈 덮인 산")).toBeInTheDocument();
    expect(screen.queryByText("바닷가")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "전체" }));
    expect(screen.getByText("바닷가")).toBeInTheDocument();
  });

  it("살 수 있는 배경은 가격과 함께 구매 버튼이 된다", async () => {
    await setup();
    await userEvent.click(tile("비 오는 창가"));
    expect(screen.getByRole("button", { name: "400P로 구매" })).toBeEnabled();
  });

  it("가진 배경은 적용하기, 보상 배경은 조건이 눌리지 않는 버튼에 보인다", async () => {
    await setup();
    await userEvent.click(tile("숲속 아침"));
    expect(screen.getByText("가지고 있어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "적용하기" })).toBeEnabled();
    await userEvent.click(tile("모닥불"));
    expect(screen.getByRole("button", { name: "연속 공부 18 / 30일" })).toBeDisabled();
    expect(screen.getByText("연속 30일")).toBeInTheDocument();
  });

  it("적용하면 사용 중이 되어 버튼이 눌리지 않는다", async () => {
    await setup();
    await userEvent.click(tile("숲속 아침"));
    await userEvent.click(screen.getByRole("button", { name: "적용하기" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "사용 중" })).toBeDisabled());
  });

  it("사면 알림이 뜨고 그 배경이 사용 중이 된다", async () => {
    const { gateway } = await setup();
    await userEvent.click(tile("비 오는 창가"));
    await userEvent.click(screen.getByRole("button", { name: "400P로 구매" }));
    const sheet = await screen.findByRole("dialog");
    await userEvent.click(within(sheet).getByRole("button", { name: "구매하기" }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("비 오는 창가를 구매했어요!"));
    await waitFor(() => expect(screen.getByRole("button", { name: "사용 중" })).toBeDisabled());
    expect(await gateway.getBalance()).toBe(840);
  });

  it("포인트가 모자라면 모자람 창이 열린다", async () => {
    await setup(100);
    await userEvent.click(tile("비 오는 창가"));
    await userEvent.click(screen.getByRole("button", { name: "400P로 구매" }));
    expect(await screen.findByText(/비 오는 창가를 구매하려면/)).toBeInTheDocument();
  });
});
