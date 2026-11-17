import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { MascotPickerCard } from "../../components/shop/MascotPickerCard";
import { buildPointsFixture, type PointsScene } from "../../fixtures";
import { createFakePointsGateway } from "../../gateway/createFakePointsGateway";
import type { PointsGateway } from "../../gateway/PointsGateway";
import { PointsGatewayProvider } from "../../gateway/PointsGatewayContext";
import type { ShopData, ShopItem } from "../../types";
import { ShopTab } from "../ShopTab";

function shopData(scene: PointsScene): ShopData {
  const f = buildPointsFixture(scene);
  return { items: f.items, mascots: f.mascots, totalFocusSec: f.totalFocusSec };
}

/** 상점 탭은 미리 보는 결제 상품의 가격을 경계에 묻는다. */
function points(gateway: PointsGateway = createFakePointsGateway("default")) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <PointsGatewayProvider gateway={gateway} userId={1}>
          {children}
        </PointsGatewayProvider>
      </QueryClientProvider>
    );
  };
}

function renderTab(scene: PointsScene) {
  const handlers = { onOpen: vi.fn(), onOpenMascots: vi.fn(), onSelectMascot: vi.fn() };
  render(<ShopTab data={shopData(scene)} {...handlers} />, { wrapper: points() });
  return handlers;
}

describe("ShopTab", () => {
  it("다음 마스코트 카드가 남은 시간과 막대를 보이고 누르면 마스코트 모으기로 간다", async () => {
    const { onOpenMascots } = renderTab("default");
    expect(screen.getByText("순공 4시간 12분 더 하면 열려요")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "부기까지 86% 모았어요" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /다음 캐릭터 부기/ }));
    expect(onOpenMascots).toHaveBeenCalledOnce();
  });

  it("다 모으면 마스코트 고르기 칸이 보이고 고른 마스코트를 저장한다", async () => {
    const { onSelectMascot } = renderTab("allCollected");
    const picker = screen.getByRole("region", { name: "오늘 함께할 캐릭터" });
    expect(within(picker).getByText("오늘은 누구랑 공부할까요?")).toBeInTheDocument();
    expect(within(picker).getAllByRole("button")).toHaveLength(7);
    await userEvent.click(within(picker).getByRole("button", { name: "램피" }));
    expect(onSelectMascot).toHaveBeenCalledWith("lamp");
  });

  it("공부 시간 마스코트를 다 열었어도 캠코미를 사지 않았으면 고르기 칸 대신 캠코미 가격을 보이고 누르면 캠코미를 사러 간다", async () => {
    const data = shopData("allCollected");
    const onOpenMascots = vi.fn();
    render(
      <ShopTab
        data={{
          ...data,
          mascots: data.mascots.map((mascot) =>
            mascot.id === "camcorder" ? { ...mascot, unlocked: false } : mascot,
          ),
        }}
        onOpen={vi.fn()}
        onOpenMascots={onOpenMascots}
        onSelectMascot={vi.fn()}
      />,
      { wrapper: points() },
    );
    expect(screen.queryByRole("region", { name: "오늘 함께할 캐릭터" })).not.toBeInTheDocument();
    expect(screen.getByText("1,000P로 열기")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "다음 캐릭터 캠코미, 1,000P로 열기" }),
    );
    expect(onOpenMascots).toHaveBeenCalledWith("camcorder");
  });

  it("고르기 칸은 서버가 준 순서와 상관없이 여는 시간 순서로 놓고 포인트로 산 마스코트를 맨 뒤에 둔다", () => {
    const data = shopData("allCollected");
    render(
      <ShopTab
        data={{ ...data, mascots: data.mascots.toReversed() }}
        onOpen={vi.fn()}
        onOpenMascots={vi.fn()}
        onSelectMascot={vi.fn()}
      />,
      { wrapper: points() },
    );
    const picker = screen.getByRole("region", { name: "오늘 함께할 캐릭터" });
    expect(
      within(picker)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["타이미", "몽당이", "플래니", "락키", "부기", "램피", "캠코미"]);
  });

  it("고르기 칸의 마스코트는 마스코트마다 꾸며 둔 모습으로 보인다", () => {
    const data = shopData("allCollected");
    const mug: ShopItem = {
      id: "planner-mug",
      kind: "accessory",
      name: "머그잔",
      imageUrl: "/planner-mug.png",
      acquire: { type: "price", price: 100 },
      owned: true,
      inUse: true,
      mascotId: "planner",
      slot: "held",
    };
    render(
      <ShopTab
        data={{ ...data, items: [...data.items, mug] }}
        onOpen={vi.fn()}
        onOpenMascots={vi.fn()}
        onSelectMascot={vi.fn()}
      />,
      { wrapper: points() },
    );
    const picker = screen.getByRole("region", { name: "오늘 함께할 캐릭터" });
    const layers = (name: string) =>
      [
        ...within(picker)
          .getByRole("button", { name })
          .querySelectorAll("img[data-slot^='accessory-']"),
      ].map((img) => img.getAttribute("src"));
    expect(layers("플래니")).toEqual(["/planner-mug.png"]);
    expect(layers("타이미")).toEqual([]);
  });

  it("소품 줄이 세 개씩 나오고 전체 보기로 소품 화면을 연다", async () => {
    const { onOpen } = renderTab("default");
    const accessories = screen.getByRole("region", { name: "타이미 소품" });
    expect(within(accessories).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText("플래너 꾸미기")).not.toBeInTheDocument();
    await userEvent.click(within(accessories).getByRole("button", { name: /전체 보기/ }));
    expect(onOpen).toHaveBeenLastCalledWith("accessory");
  });

  it("타이머 배경은 이번 출시에 팔지 않아 배경 상품이 있어도 배경 줄을 그리지 않는다", () => {
    renderTab("default");
    expect(screen.queryByRole("region", { name: "타이머 배경" })).not.toBeInTheDocument();
  });

  it("앞 그림이 없는 상품은 뒤 그림을 칸에 보인다", () => {
    const data = shopData("default");
    const ribbon = data.items.find((item) => item.id === "acc-stopwatch-ribbon");
    if (ribbon === undefined) throw new Error("고정 데이터에 단추 리본이 없다");
    ribbon.imageUrl = null;
    ribbon.backImageUrl = "/ribbon-back.png";
    const { container } = render(
      <ShopTab data={data} onOpen={vi.fn()} onOpenMascots={vi.fn()} onSelectMascot={vi.fn()} />,
      { wrapper: points() },
    );
    expect(container.querySelector("img[src='/ribbon-back.png']")).not.toBeNull();
  });

  it("고르기 줄에 가지지 않은 마스코트가 있으면 흐리게 그리고 누르면 고르지 않고 사거나 열리는 길을 보러 간다", async () => {
    const data = shopData("allCollected");
    const onSelect = vi.fn();
    const onLockedPress = vi.fn();
    render(
      <MascotPickerCard
        mascots={data.mascots.map((mascot) =>
          mascot.id === "camcorder" ? { ...mascot, unlocked: false } : mascot,
        )}
        worn={new Map()}
        onSelect={onSelect}
        onLockedPress={onLockedPress}
      />,
    );
    const locked = screen.getByRole("button", { name: "캠코미 잠김" });
    expect(locked).not.toHaveAttribute("aria-pressed");
    expect(locked.querySelector(".grayscale")).not.toBeNull();
    await userEvent.click(locked);
    expect(onLockedPress).toHaveBeenCalledWith("camcorder");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("미리 보는 소품에 결제 상품이 있으면 결제 대신 스토어 가격을 그대로 보인다", async () => {
    const data = shopData("default");
    const set = data.items.find((item) => item.id === "acc-stopwatch-rainset");
    if (set === undefined) throw new Error("고정 데이터에 비 오는 날 세트가 없다");
    const gateway = createFakePointsGateway("default");
    // 서버가 세트를 앞에 주면 상점 탭 미리 보기 세 칸에 든다.
    render(
      <ShopTab
        data={{ ...data, items: [set, ...data.items.filter((item) => item !== set)] }}
        onOpen={vi.fn()}
        onOpenMascots={vi.fn()}
        onSelectMascot={vi.fn()}
      />,
      {
        wrapper: points({
          ...gateway,
          getStorePrices: async () => ({ set_stopwatch_rain: "₩2,200" }),
        }),
      },
    );
    const accessories = screen.getByRole("region", { name: "타이미 소품" });
    const tile = within(accessories).getByRole("button", { name: /비 오는 날 세트/ });
    expect(await within(tile).findByText("₩2,200")).toBeVisible();
    expect(within(tile).queryByText("결제")).not.toBeInTheDocument();
  });

  it("상품을 누르면 그 상품을 골라서 열도록 상품 id를 함께 넘긴다", async () => {
    const { onOpen } = renderTab("default");
    const accessories = screen.getByRole("region", { name: "타이미 소품" });
    await userEvent.click(within(accessories).getByRole("button", { name: /단추 리본/ }));
    expect(onOpen).toHaveBeenLastCalledWith("accessory", "acc-stopwatch-ribbon");
  });
});
