import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { buildPointsFixture } from "../../../fixtures";
import { createFakePointsGateway } from "../../../gateway/createFakePointsGateway";
import type { PointsGateway } from "../../../gateway/PointsGateway";
import { PointsGatewayProvider } from "../../../gateway/PointsGatewayContext";
import { MascotCollectionScreen } from "../../../screens/MascotCollectionScreen";
import type { AccessorySlot, MascotId, ShopData, ShopItem } from "../../../types";
import { wornByMascot } from "../../../model/wornAccessories";
import { ProfileMascotRow } from "../ProfileMascotRow";

const fixture = buildPointsFixture("default");
const shop = {
  items: fixture.items,
  mascots: fixture.mascots,
  totalFocusSec: fixture.totalFocusSec,
};

/** 그림이 있는 소품이며 기본은 가지고 있고 끼고 있다. */
function wornItem(
  id: string,
  mascotId: MascotId,
  slot: AccessorySlot,
  extra: Partial<ShopItem> = {},
): ShopItem {
  return {
    id,
    kind: "accessory",
    name: id,
    imageUrl: `/${id}.png`,
    acquire: { type: "price", price: 100 },
    owned: true,
    inUse: true,
    mascotId,
    slot,
    ...extra,
  };
}

/** 타이미는 모자, 고르지 않은 플래니는 머그잔, 몽당이는 세트를 끼고 잠긴 부기도 목도리를 낀 상점 */
const decorated: ShopData = {
  ...shop,
  items: [
    ...shop.items,
    wornItem("timi-cap", "stopwatch", "head"),
    wornItem("planner-mug", "planner", "held"),
    wornItem("pencil-bee", "pencil", "set", { backImageUrl: "/pencil-bee-back.png" }),
    wornItem("pencil-cap", "pencil", "head", { inUse: false }),
    wornItem("book-scarf-worn", "book", "body"),
  ],
};

/** 버튼 안에 그린 소품 그림의 주소를 뒤에서 앞 순서로 */
function accessoryLayers(button: HTMLElement) {
  return [...button.querySelectorAll("img[data-slot^='accessory-']")].map((img) =>
    img.getAttribute("src"),
  );
}

function renderScreen(
  props: Partial<Parameters<typeof MascotCollectionScreen>[0]> = {},
  gateway: PointsGateway = createFakePointsGateway("default"),
  entry = "/points/mascots",
) {
  const onSelect = vi.fn().mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PointsGatewayProvider gateway={gateway} userId={1}>
        <MemoryRouter initialEntries={[entry]}>
          <MascotCollectionScreen
            data={shop}
            balance={1240}
            onSelect={onSelect}
            onBack={() => {}}
            {...props}
          />
        </MemoryRouter>
      </PointsGatewayProvider>
    </QueryClientProvider>,
  );
  return { onSelect, gateway };
}

describe("MascotCollectionScreen", () => {
  it("위에 누적 순공이 있고 마스코트마다 상태가 보인다", () => {
    renderScreen();
    expect(screen.getByText("누적 순공")).toBeInTheDocument();
    expect(screen.getByText("25시간 48분")).toBeInTheDocument();
    expect(screen.getAllByText("선택 가능")).toHaveLength(3);
    expect(screen.getAllByText("선택 중")).toHaveLength(1);
    expect(screen.getByText("4시간 12분 남음")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "타이미 선택 중" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("남은 시간이 길어도 낱말 중간에서 줄이 바뀌지 않는다", () => {
    renderScreen();
    // 좁은 칸에서 "124시간 12분 남음"이 "남 / 음"으로 갈라진 것을 Android 실기기에서 봤다.
    expect(screen.getByText("4시간 12분 남음")).toHaveClass("break-keep");
  });

  it("잠긴 마스코트도 다음 차례와 상관없이 모두 이름을 보인다", () => {
    renderScreen();
    expect(screen.getByText("부기")).toBeInTheDocument();
    expect(screen.getByText("램피")).toBeInTheDocument();
    expect(screen.getByText("캠코미")).toBeInTheDocument();
    expect(screen.queryByText("???")).not.toBeInTheDocument();
  });

  it("다음 차례 뒤의 잠긴 마스코트를 눌러도 시트 제목에 이름을 보인다", async () => {
    renderScreen();
    await userEvent.click(screen.getByRole("button", { name: /^램피 잠김/ }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("heading", { name: "램피" })).toBeInTheDocument();
    expect(within(sheet).getByRole("img", { name: "램피까지 51% 모았어요" })).toBeInTheDocument();
  });

  it("잠긴 마스코트를 누르면 남은 시간과 진행을 알리는 시트가 뜬다", async () => {
    renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "부기 잠김, 4시간 12분 남음" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("순공 4시간 12분 더 하면 열려요.")).toBeInTheDocument();
    expect(within(sheet).getByRole("img", { name: "부기까지 86% 모았어요" })).toBeInTheDocument();
    expect(within(sheet).getByText("30시간")).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("연 마스코트를 누르면 선택을 부른다", async () => {
    const { onSelect } = renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "플래니 선택 가능" }));
    expect(onSelect).toHaveBeenCalledWith("planner");
  });

  it("다 모아도 모두 이름과 선택 가능이 보인다", () => {
    const done = buildPointsFixture("allCollected");
    renderScreen({
      data: { items: done.items, mascots: done.mascots, totalFocusSec: done.totalFocusSec },
    });
    expect(screen.getByText("락키")).toBeInTheDocument();
    expect(screen.getAllByText("선택 가능")).toHaveLength(6);
  });

  it("새로 열린 마스코트가 있으면 축하 화면을 한 번만 보인다", async () => {
    const { onSelect } = renderScreen({ newlyUnlocked: "lamp" });
    expect(screen.getByText("새 마스코트")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "램피" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "나중에" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByText("새 마스코트")).not.toBeInTheDocument();
    expect(screen.getByText("누적 순공")).toBeInTheDocument();
  });

  it("축하 화면에서 바꾸기를 누르면 그 마스코트를 고른다", async () => {
    const { onSelect } = renderScreen({ newlyUnlocked: "lamp" });
    await userEvent.click(screen.getByRole("button", { name: "이 마스코트로 바꾸기" }));
    expect(onSelect).toHaveBeenCalledWith("lamp");
    expect(screen.queryByText("새 마스코트")).not.toBeInTheDocument();
  });

  describe("꾸민 모습", () => {
    it("열린 마스코트 칸마다 그 마스코트가 낀 소품을 입혀 그리고 고르지 않은 마스코트도 꾸민 대로 보인다", () => {
      renderScreen({ data: decorated });

      expect(accessoryLayers(screen.getByRole("button", { name: "타이미 선택 중" }))).toEqual([
        "/timi-cap.png",
      ]);
      expect(accessoryLayers(screen.getByRole("button", { name: "플래니 선택 가능" }))).toEqual([
        "/planner-mug.png",
      ]);
      expect(accessoryLayers(screen.getByRole("button", { name: "몽당이 선택 가능" }))).toEqual([
        "/pencil-bee-back.png",
        "/pencil-bee.png",
      ]);
      expect(accessoryLayers(screen.getByRole("button", { name: "락키 선택 가능" }))).toEqual([]);
    });

    it("잠긴 마스코트는 낀 소품이 있어도 소품 없이 흐린 그림 그대로다", () => {
      renderScreen({ data: decorated });

      const locked = screen.getByRole("button", { name: "부기 잠김, 4시간 12분 남음" });
      expect(locked.querySelectorAll("[data-slot^='accessory-']")).toHaveLength(0);
      expect(locked.querySelector(".grayscale")).toBeInTheDocument();
    });

    it("소품 판이 칸을 넘지 않게 마스코트를 판 안쪽 자리에 줄여 둔다", () => {
      renderScreen({ data: decorated });

      const cell = screen.getByRole("button", { name: "타이미 선택 중" });
      const body = cell.querySelector<HTMLElement>("[data-mascot-in-board]");
      // 판 한 변 1440 가운데 마스코트 판 1024가 사방 208씩 안쪽에 놓인다.
      expect(body?.style.inset).toBe("14.4444%");
    });
  });

  describe("포인트로 여는 마스코트", () => {
    const priced = {
      ...shop,
      mascots: shop.mascots.map((mascot) =>
        mascot.id === "camcorder" ? { ...mascot, price: 500, unlocked: false } : mascot,
      ),
    };

    it("상점에서 캠코미를 사러 들어오면 바로 구매 확인 창을 연다", async () => {
      renderScreen({ data: priced }, undefined, "/points/mascots?item=camcorder");
      const sheet = await screen.findByRole("dialog");
      expect(within(sheet).getByText("캠코미를 구매할까요?")).toBeInTheDocument();
      expect(
        within(sheet).getByText("포인트로 산 마스코트는 환불되지 않아요."),
      ).toBeInTheDocument();
    });

    it("상점에서 잠긴 공부 시간 마스코트를 누르고 들어오면 남은 시간 시트를 연다", async () => {
      renderScreen({ data: priced }, undefined, "/points/mascots?item=book");
      const sheet = await screen.findByRole("dialog");
      expect(within(sheet).getByText("순공 4시간 12분 더 하면 열려요.")).toBeInTheDocument();
    });

    it("이름을 숨기지 않고 남은 시간 대신 가격을 보인다", () => {
      renderScreen({ data: priced });
      expect(screen.getByRole("button", { name: "캠코미 잠김, 500P" })).toBeVisible();
    });

    it("잠금 시트 제목에 캠코미 이름을 보인다", async () => {
      renderScreen({ data: priced });
      await userEvent.click(screen.getByRole("button", { name: "캠코미 잠김, 500P" }));
      const sheet = await screen.findByRole("dialog");
      expect(within(sheet).getByRole("heading", { name: "캠코미" })).toBeInTheDocument();
    });

    it("잠금 시트에서 사면 서버에 구매를 보내고 축하 화면에서 바로 바꿀 수 있다", async () => {
      const gateway = createFakePointsGateway("default", { balance: 1240 });
      const purchase = vi
        .spyOn(gateway, "purchaseMascot")
        .mockResolvedValue({ ok: true, balance: 740 });
      const { onSelect } = renderScreen({ data: priced }, gateway);

      await userEvent.click(screen.getByRole("button", { name: "캠코미 잠김, 500P" }));
      await userEvent.click(await screen.findByRole("button", { name: "500P로 열기" }));
      await userEvent.click(await screen.findByRole("button", { name: "구매하기" }));

      expect(purchase).toHaveBeenCalledWith("camcorder");
      expect(await screen.findByText("새 마스코트")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "이 마스코트로 바꾸기" }));
      expect(onSelect).toHaveBeenCalledWith("camcorder");
      expect(screen.getByText("누적 순공")).toBeInTheDocument();
    });

    it("포인트가 모자라면 구매를 보내지 않고 모자람 창을 띄운다", async () => {
      const gateway = createFakePointsGateway("default", { balance: 100 });
      const purchase = vi.spyOn(gateway, "purchaseMascot");
      renderScreen({ data: priced, balance: 100 }, gateway);

      await userEvent.click(screen.getByRole("button", { name: "캠코미 잠김, 500P" }));
      await userEvent.click(await screen.findByRole("button", { name: "500P로 열기" }));

      expect(await screen.findByText(/더 필요해요/)).toBeInTheDocument();
      expect(purchase).not.toHaveBeenCalled();
    });

    /** 잔액이 모자란 채로 캠코더를 사려고 해서 모자람 창을 연다. */
    async function openInsufficient(props: Parameters<typeof renderScreen>[0]) {
      const gateway = createFakePointsGateway("default", { balance: 100 });
      const purchase = vi
        .spyOn(gateway, "purchaseMascot")
        .mockResolvedValue({ ok: true, balance: 100 });
      renderScreen({ data: priced, balance: 100, ...props }, gateway);
      await userEvent.click(screen.getByRole("button", { name: "캠코미 잠김, 500P" }));
      await userEvent.click(await screen.findByRole("button", { name: "500P로 열기" }));
      await screen.findByText(/더 필요해요/);
      return { purchase };
    }

    it("모자람 창에서 충전하면 이어서 마스코트를 산다", async () => {
      const onCharge = vi.fn(async () => ({
        status: "completed" as const,
        granted: 500,
        bonus: 0,
        balance: 600,
      }));
      const { purchase } = await openInsufficient({ packs: fixture.packs, onCharge });

      await userEvent.click(screen.getByRole("button", { name: "500P 충전하고 구매하기" }));

      expect(onCharge).toHaveBeenCalledWith("points_500");
      expect(purchase).toHaveBeenCalledWith("camcorder");
      expect(await screen.findByText("새 마스코트")).toBeInTheDocument();
    });

    it("모자람 창에서 광고를 보면 잔액만 채우고 사지는 않는다", async () => {
      const onWatchAd = vi.fn(async () => ({ status: "rewarded" as const, balance: 130 }));
      const { purchase } = await openInsufficient({ earn: fixture.earn, onWatchAd });

      await userEvent.click(screen.getByRole("button", { name: /광고 보고 30P 받기/ }));

      expect(onWatchAd).toHaveBeenCalledOnce();
      expect(purchase).not.toHaveBeenCalled();
    });

    it("충전과 광고를 맡을 수 없는 곳에서는 모자람 창에 두 줄이 없다", async () => {
      await openInsufficient({ earn: fixture.earn, packs: fixture.packs });
      const sheet = screen.getByRole("dialog");
      expect(within(sheet).queryByText(/광고 보고/)).not.toBeInTheDocument();
      expect(within(sheet).queryByText(/충전하고 구매하기/)).not.toBeInTheDocument();
      expect(within(sheet).getByText("일일 미션 클리어하기")).toBeInTheDocument();
    });
  });
});

describe("ProfileMascotRow", () => {
  function renderRow(data: ShopData = shop) {
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <ProfileMascotRow
          mascots={data.mascots}
          worn={wornByMascot(data.items)}
          onSelect={onSelect}
          decorateTo="/points/accessories"
        />
      </MemoryRouter>,
    );
    return { onSelect };
  }

  it("연 마스코트는 고르지 않았어도 꾸민 모습으로, 잠긴 마스코트는 소품 없이 보인다", () => {
    renderRow(decorated);
    expect(accessoryLayers(screen.getByRole("button", { name: "타이미" }))).toEqual([
      "/timi-cap.png",
    ]);
    expect(accessoryLayers(screen.getByRole("button", { name: "플래니" }))).toEqual([
      "/planner-mug.png",
    ]);
    expect(accessoryLayers(screen.getByRole("button", { name: "부기 잠김" }))).toEqual([]);
  });

  it("제목과 꾸미기 링크, 마스코트가 보인다", () => {
    renderRow();
    expect(screen.getByText("내 마스코트")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /꾸미기/ })).toHaveAttribute(
      "href",
      "/points/accessories",
    );
    expect(screen.getByRole("button", { name: "타이미" })).toHaveAttribute("aria-pressed", "true");
  });

  it("연 마스코트를 누르면 바꾸고 잠긴 것은 눌러도 바뀌지 않는다", async () => {
    const { onSelect } = renderRow();
    await userEvent.click(screen.getByRole("button", { name: "플래니" }));
    expect(onSelect).toHaveBeenCalledWith("planner");
    onSelect.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "램피 잠김" }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
