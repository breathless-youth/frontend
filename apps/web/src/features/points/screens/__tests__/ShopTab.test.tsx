import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MascotPickerCard } from "../../components/shop/MascotPickerCard";
import { buildPointsFixture, type PointsScene } from "../../fixtures";
import type { ShopData, ShopItem } from "../../types";
import { ShopTab } from "../ShopTab";

function shopData(scene: PointsScene): ShopData {
  const f = buildPointsFixture(scene);
  return { items: f.items, mascots: f.mascots, totalFocusSec: f.totalFocusSec };
}

function renderTab(scene: PointsScene) {
  const handlers = { onOpen: vi.fn(), onOpenMascots: vi.fn(), onSelectMascot: vi.fn() };
  render(<ShopTab data={shopData(scene)} {...handlers} />);
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

  it("상품을 누르면 그 상품을 골라서 열도록 상품 id를 함께 넘긴다", async () => {
    const { onOpen } = renderTab("default");
    const accessories = screen.getByRole("region", { name: "타이미 소품" });
    await userEvent.click(within(accessories).getByRole("button", { name: /단추 리본/ }));
    expect(onOpen).toHaveBeenLastCalledWith("accessory", "acc-stopwatch-ribbon");
  });
});
