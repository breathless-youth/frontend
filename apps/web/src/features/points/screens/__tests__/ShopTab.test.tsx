import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { buildPointsFixture, type PointsScene } from "../../fixtures";
import type { ShopData } from "../../types";
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
    expect(screen.getByRole("img", { name: "램프까지 86% 모았어요" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /다음 마스코트 램프/ }));
    expect(onOpenMascots).toHaveBeenCalledOnce();
  });

  it("다 모으면 마스코트 고르기 칸이 보이고 고른 마스코트를 저장한다", async () => {
    const { onSelectMascot } = renderTab("allCollected");
    const picker = screen.getByRole("region", { name: "오늘 함께할 마스코트" });
    expect(within(picker).getByText("오늘은 누구랑 공부할까요?")).toBeInTheDocument();
    expect(within(picker).getAllByRole("button")).toHaveLength(7);
    await userEvent.click(within(picker).getByRole("button", { name: "램프" }));
    expect(onSelectMascot).toHaveBeenCalledWith("lamp");
  });

  it("상품 줄이 소품과 타이머 배경 두 종류로 세 개씩 나오고 전체 보기로 그 종류를 연다", async () => {
    const { onOpen } = renderTab("default");
    const accessories = screen.getByRole("region", { name: "스톱워치 소품" });
    const backgrounds = screen.getByRole("region", { name: "타이머 배경" });
    expect(within(accessories).getAllByRole("listitem")).toHaveLength(3);
    expect(within(backgrounds).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText("플래너 꾸미기")).not.toBeInTheDocument();
    await userEvent.click(within(accessories).getByRole("button", { name: /전체 보기/ }));
    expect(onOpen).toHaveBeenLastCalledWith("accessory");
    await userEvent.click(within(backgrounds).getAllByRole("button", { name: /400P/ })[0]);
    expect(onOpen).toHaveBeenLastCalledWith("timerBackground");
  });
});
