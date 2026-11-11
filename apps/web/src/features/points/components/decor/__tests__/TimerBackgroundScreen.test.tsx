import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isNativeBridgeAvailable } from "@/lib/bridge";
import type * as Bridge from "@/lib/bridge";
import { showToast } from "@/lib/toast";
import { PointsBackgroundsPage } from "@/routes/PointsBackgroundsPage";

import { createFakePointsGateway } from "../../../gateway/createFakePointsGateway";
import { CategoryChips } from "../CategoryChips";
import type { PointsGateway } from "../../../gateway/PointsGateway";
import { PointsGatewayProvider } from "../../../gateway/PointsGatewayContext";

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof Bridge>()),
  isNativeBridgeAvailable: vi.fn(() => false),
}));

afterEach(() => {
  vi.mocked(showToast).mockClear();
  vi.mocked(isNativeBridgeAvailable).mockReturnValue(false);
});

async function setup(balance = 1240, wrap: (g: PointsGateway) => PointsGateway = (g) => g) {
  const gateway = wrap(createFakePointsGateway("default", { balance }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PointsGatewayProvider gateway={gateway} userId={7}>
        <MemoryRouter initialEntries={["/points/backgrounds"]}>
          <PointsBackgroundsPage />
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

  it("적용이 실패하면 알리고 다시 누를 수 있다", async () => {
    await setup(1240, (g) => ({
      ...g,
      setTimerBackground: () => Promise.reject(new Error("down")),
    }));
    await userEvent.click(tile("숲속 아침"));
    await userEvent.click(screen.getByRole("button", { name: "적용하기" }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("잠시 후 다시 시도해 주세요"));
    expect(screen.getByRole("button", { name: "적용하기" })).toBeEnabled();
  });

  it("앱 밖에서는 모자람 창에 광고와 충전 줄이 없다", async () => {
    await setup(100);
    await userEvent.click(tile("비 오는 창가"));
    await userEvent.click(screen.getByRole("button", { name: "400P로 구매" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).queryByText(/광고 보고/)).not.toBeInTheDocument();
    expect(within(sheet).queryByText(/충전하고 구매하기/)).not.toBeInTheDocument();
  });

  it("앱 안에서는 모자람 창에 광고와 충전 줄이 있다", async () => {
    vi.mocked(isNativeBridgeAvailable).mockReturnValue(true);
    await setup(100);
    await userEvent.click(tile("비 오는 창가"));
    await userEvent.click(screen.getByRole("button", { name: "400P로 구매" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText(/광고 보고/)).toBeInTheDocument();
    expect(within(sheet).getByText(/충전하고 구매하기/)).toBeInTheDocument();
  });
});

describe("CategoryChips", () => {
  it("이름을 모르는 분류는 칩을 만들지 않고 코드 글자를 보이지 않는다", () => {
    render(<CategoryChips categories={["nature", "SPACE"]} value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "전체" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByText("SPACE")).not.toBeInTheDocument();
  });
});
