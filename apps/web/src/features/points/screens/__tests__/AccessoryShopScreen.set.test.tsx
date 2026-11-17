import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { trackPointsSetViewed } from "@/lib/amplitude";
import { PointsAccessoriesPage } from "@/routes/PointsAccessoriesPage";

import { createFakePointsGateway } from "../../gateway/createFakePointsGateway";
import type { PointsGateway } from "../../gateway/PointsGateway";
import { PointsGatewayProvider } from "../../gateway/PointsGatewayContext";

vi.mock("@/lib/amplitude", async (original) => ({
  ...(await original<object>()),
  trackPointsSetViewed: vi.fn(),
}));

function renderScreen(gateway: PointsGateway = createFakePointsGateway("default")) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PointsGatewayProvider gateway={gateway} userId={1}>
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

  it("결제 버튼 바로 위에 충전 칸과 같은 결제·환불 안내 화면으로 가는 링크가 있다", async () => {
    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "세트" }));

    const guide = screen.getByRole("link", { name: "결제·환불 안내" });
    const buy = screen.getByRole("button", { name: /구매하기/ });
    expect(guide.compareDocumentPosition(buy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(guide).toHaveAttribute("href", "/points/payment-guide");
    expect(screen.queryByText(/App Store|Google Play/)).not.toBeInTheDocument();
  });
});

describe("AccessoryShopScreen의 세트 결제", () => {
  // 서버는 첫 착용 요청을 결제 상품의 첫 착용으로 기록하고, 그 뒤에는 7일 철회를 받지 않는다.
  it("결제가 끝나면 착용 요청 없이 그 칸을 고른 채 보유로 바꾸고 버튼을 착용하기로 둔다", async () => {
    const gateway = createFakePointsGateway("default");
    const equip = vi.spyOn(gateway, "equipAccessory");
    renderScreen(gateway);
    await userEvent.click(await screen.findByRole("button", { name: "세트" }));

    await userEvent.click(await screen.findByRole("button", { name: "₩1,100에 구매하기" }));

    expect(await screen.findByRole("button", { name: "착용하기" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "비 오는 날 세트, 가지고 있어요", pressed: true }),
    ).toBeInTheDocument();
    expect(equip).not.toHaveBeenCalled();
  });

  it("결제 뒤 착용하기를 누르면 그때 착용 요청을 보내고 입은 상태가 된다", async () => {
    const gateway = createFakePointsGateway("default");
    const equip = vi.spyOn(gateway, "equipAccessory");
    renderScreen(gateway);
    await userEvent.click(await screen.findByRole("button", { name: "세트" }));
    await userEvent.click(await screen.findByRole("button", { name: "₩1,100에 구매하기" }));

    await userEvent.click(await screen.findByRole("button", { name: "착용하기" }));

    expect(equip).toHaveBeenCalledOnce();
    expect(equip).toHaveBeenCalledWith("stopwatch", "set", "acc-stopwatch-rainset");
    expect(await screen.findByRole("button", { name: "벗기" })).toBeEnabled();
  });

  it("결제가 끝나고 상품을 받는 동안 소품을 구매하고 있다고 알린다", async () => {
    const gateway = createFakePointsGateway("default");
    vi.spyOn(gateway, "purchaseStoreItem").mockImplementation((_itemId, onPaid) => {
      onPaid?.();
      return new Promise(() => {});
    });
    renderScreen(gateway);
    await userEvent.click(await screen.findByRole("button", { name: "세트" }));

    await userEvent.click(await screen.findByRole("button", { name: "₩1,100에 구매하기" }));

    expect(await screen.findByText("소품을 구매하고 있어요")).toBeVisible();
  });
});

describe("AccessoryShopScreen의 세트 칸 가격 자리", () => {
  /** 세트 가격을 정해 둔 가짜 경계이며 storeItems가 false면 결제를 맡을 수 없는 곳(브라우저, 예전 앱)이다. */
  function withPrices(getStorePrices: PointsGateway["getStorePrices"], storeItems = true) {
    const gateway = createFakePointsGateway("default");
    return {
      ...gateway,
      capabilities: { ...gateway.capabilities, storeItems },
      getStorePrices,
    } satisfies PointsGateway;
  }

  /** 받는 중에 멈춰 두었다가 답이나 실패를 정할 수 있는 가격 요청 */
  function heldPrices() {
    let answer: (prices: Record<string, string>) => void = () => {};
    let fail: (error: Error) => void = () => {};
    const request = new Promise<Record<string, string>>((resolve, reject) => {
      answer = resolve;
      fail = reject;
    });
    return { getStorePrices: () => request, answer, fail };
  }

  async function openSetCell() {
    await userEvent.click(await screen.findByRole("button", { name: "세트" }));
    return within(screen.getByRole("group", { name: "소품 고르기" })).getByRole("button");
  }

  const pendingMark = (cell: HTMLElement) =>
    cell.querySelector<HTMLElement>('[data-slot="store-price-pending"]');

  it("스토어가 준 원화 가격을 결제 대신 그대로 보인다", async () => {
    renderScreen(withPrices(async () => ({ set_stopwatch_rain: "₩2,200" })));
    const cell = await openSetCell();

    expect(await within(cell).findByText("₩2,200")).toBeVisible();
    expect(within(cell).queryByText("결제")).not.toBeInTheDocument();
    expect(cell).toHaveAccessibleName("비 오는 날 세트 ₩2,200");
  });

  it("미국 스토어의 달러 가격도 바꾸지 않고 받은 글자 그대로 보인다", async () => {
    renderScreen(withPrices(async () => ({ set_stopwatch_rain: "$0.99" })));
    const cell = await openSetCell();

    expect(await within(cell).findByText("$0.99")).toBeVisible();
    expect(within(cell).queryByText("결제")).not.toBeInTheDocument();
    expect(cell).toHaveAccessibleName("비 오는 날 세트 $0.99");
  });

  it("가격을 받는 동안은 결제 대신 한 줄 높이의 자리 표시를 두고, 받으면 그 자리에 가격을 보인다", async () => {
    const prices = heldPrices();
    renderScreen(withPrices(prices.getStorePrices));
    const cell = await openSetCell();

    const mark = pendingMark(cell);
    expect(mark).not.toBeNull();
    // 글자 한 줄을 차지하는 빈칸이라 가격이 와도 칸 높이가 그대로다.
    expect(mark?.textContent).toBe(" ");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(within(cell).queryByText("결제")).not.toBeInTheDocument();
    expect(cell).toHaveAccessibleName("비 오는 날 세트, 결제 상품");

    prices.answer({ set_stopwatch_rain: "₩2,200" });

    expect(await within(cell).findByText("₩2,200")).toBeVisible();
    expect(pendingMark(cell)).toBeNull();
  });

  it("가격을 받지 못하면 자리 표시를 거두고 결제 상품이라는 것만 보인다", async () => {
    const prices = heldPrices();
    renderScreen(withPrices(prices.getStorePrices));
    const cell = await openSetCell();
    expect(pendingMark(cell)).not.toBeNull();

    prices.fail(new Error("store down"));

    expect(await within(cell).findByText("결제")).toBeVisible();
    expect(pendingMark(cell)).toBeNull();
    expect(cell).toHaveAccessibleName("비 오는 날 세트, 결제 상품");
  });

  it("스토어가 그 상품의 가격을 주지 않으면(비회원, 앱 응답 없음) 자리 표시를 거두고 결제를 보인다", async () => {
    const prices = heldPrices();
    renderScreen(withPrices(prices.getStorePrices));
    const cell = await openSetCell();
    expect(pendingMark(cell)).not.toBeNull();

    prices.answer({});

    await waitFor(() => expect(pendingMark(cell)).toBeNull());
    expect(within(cell).getByText("결제")).toBeVisible();
  });

  it("결제를 맡을 수 없는 곳에서는 가격을 묻지 않고 자리 표시 없이 결제를 보인다", async () => {
    const getStorePrices = vi.fn(async () => ({ set_stopwatch_rain: "₩2,200" }));
    renderScreen(withPrices(getStorePrices, false));
    const cell = await openSetCell();

    expect(within(cell).getByText("결제")).toBeVisible();
    expect(pendingMark(cell)).toBeNull();
    expect(getStorePrices).not.toHaveBeenCalled();
  });
});
