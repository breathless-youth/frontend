import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { showToast } from "@/lib/toast";
import { PointsAccessoriesPage } from "@/routes/PointsAccessoriesPage";

import { AccessoryGrid } from "../../components/items/AccessoryGrid";
import { buildPointsFixture } from "../../fixtures";
import { createFakePointsGateway } from "../../gateway/createFakePointsGateway";
import type { PointsGateway } from "../../gateway/PointsGateway";
import { PointsGatewayProvider } from "../../gateway/PointsGatewayContext";
import type { MascotId } from "../../types";

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

afterEach(() => {
  vi.mocked(showToast).mockClear();
});

function renderScreen(
  gateway: PointsGateway,
  entry = "/points/accessories",
  guest?: { requestLogin: () => void },
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PointsGatewayProvider
        gateway={gateway}
        userId={1}
        member={guest === undefined}
        requestLogin={guest?.requestLogin}
      >
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/points/accessories" element={<PointsAccessoriesPage />} />
            <Route path="/points/mascots" element={<p>마스코트 화면</p>} />
          </Routes>
        </MemoryRouter>
      </PointsGatewayProvider>
    </QueryClientProvider>,
  );
}

describe("AccessoryShopScreen", () => {
  describe("스토어 결제 상품", () => {
    // 왕관을 결제 상품으로 바꾼 상점을 주는 가짜 경계
    function withStoreItem(storeItems: boolean) {
      const gateway = createFakePointsGateway("default");
      const getShop = gateway.getShop.bind(gateway);
      return {
        ...gateway,
        capabilities: { ...gateway.capabilities, storeItems },
        getShop: async () => {
          const shop = await getShop();
          return {
            ...shop,
            items: shop.items.map((item) =>
              item.name === "왕관"
                ? { ...item, acquire: { type: "store" as const, productId: "item_crown" } }
                : item,
            ),
          };
        },
      } satisfies PointsGateway;
    }

    // 결제 상품은 처음 입기 전까지 7일 안에 철회할 수 있어서 결제가 끝나도 입히지 않는다.
    it("스토어 가격으로 사는 버튼을 보이고, 결제가 끝나도 알림 없이 착용 요청을 보내지 않는다", async () => {
      const gateway = withStoreItem(true);
      const purchase = vi
        .spyOn(gateway, "purchaseStoreItem")
        .mockResolvedValue({ status: "completed" });
      const equip = vi.spyOn(gateway, "equipAccessory");
      renderScreen(gateway);

      await userEvent.click(await screen.findByRole("button", { name: "₩1,100에 구매하기" }));

      await waitFor(() => expect(purchase).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "₩1,100에 구매하기" })).toBeEnabled(),
      );
      expect(equip).not.toHaveBeenCalled();
      expect(showToast).not.toHaveBeenCalled();
    });

    it("비회원이 결제 상품을 사려고 하면 결제 창 대신 로그인 화면을 연다", async () => {
      const gateway = withStoreItem(true);
      const purchase = vi.spyOn(gateway, "purchaseStoreItem");
      const requestLogin = vi.fn();
      renderScreen(gateway, "/points/accessories", { requestLogin });

      await userEvent.click(await screen.findByRole("button", { name: "₩1,100에 구매하기" }));

      expect(requestLogin).toHaveBeenCalledOnce();
      expect(purchase).not.toHaveBeenCalled();
    });

    it("회원으로 알았는데 서버가 결제용 ID를 주지 않으면 실패 창 대신 로그인 화면을 연다", async () => {
      const gateway = withStoreItem(true);
      vi.spyOn(gateway, "purchaseStoreItem").mockRejectedValue(
        new ApiError("revenueCat app user id is null", 403, "MEMBER_ONLY"),
      );
      const requestLogin = vi.fn();
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <PointsGatewayProvider gateway={gateway} userId={1} member requestLogin={requestLogin}>
            <MemoryRouter initialEntries={["/points/accessories"]}>
              <Routes>
                <Route path="/points/accessories" element={<PointsAccessoriesPage />} />
              </Routes>
            </MemoryRouter>
          </PointsGatewayProvider>
        </QueryClientProvider>,
      );

      await userEvent.click(await screen.findByRole("button", { name: "₩1,100에 구매하기" }));

      await waitFor(() => expect(requestLogin).toHaveBeenCalledOnce());
      expect(screen.queryByText("결제를 완료하지 못했어요")).not.toBeInTheDocument();
    });

    it("결제를 맡을 수 없는 곳에서는 앱에서 살 수 있다고만 알린다", async () => {
      renderScreen(withStoreItem(false));
      expect(await screen.findByRole("button", { name: "앱에서 살 수 있어요" })).toBeDisabled();
    });

    it("결제는 끝났는데 상품이 늦으면 다시 결제하는 길 없이 곧 들어온다고 알린다", async () => {
      const gateway = withStoreItem(true);
      vi.spyOn(gateway, "purchaseStoreItem").mockResolvedValue({ status: "late" });
      renderScreen(gateway);

      await userEvent.click(await screen.findByRole("button", { name: "₩1,100에 구매하기" }));

      expect(await screen.findByText("상품이 곧 들어와요")).toBeVisible();
    });
  });

  it("마스코트 줄은 서버가 준 순서와 상관없이 여는 시간 순서로 놓고 포인트로 사는 마스코트를 맨 뒤에 둔다", async () => {
    const gateway = createFakePointsGateway("default");
    const getShop = gateway.getShop.bind(gateway);
    renderScreen({
      ...gateway,
      getShop: async () => {
        const shop = await getShop();
        return { ...shop, mascots: shop.mascots.toReversed() };
      },
    });
    const strip = await screen.findByRole("group", { name: "캐릭터 고르기" });
    expect(
      within(strip)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["타이미", "몽당이", "부기", "락키", "플래니", "램피", "캠코미"]);
  });

  it("마스코트 줄은 마스코트마다 꾸며 둔 모습이고 잠긴 마스코트는 소품 없이 보인다", async () => {
    const gateway = createFakePointsGateway("default");
    const getShop = gateway.getShop.bind(gateway);
    const worn = (id: string, mascotId: MascotId) => ({
      id,
      kind: "accessory" as const,
      name: id,
      imageUrl: `/${id}.png`,
      acquire: { type: "price" as const, price: 100 },
      owned: true,
      inUse: true,
      mascotId,
      slot: "held" as const,
    });
    renderScreen({
      ...gateway,
      getShop: async () => {
        const shop = await getShop();
        return {
          ...shop,
          items: [...shop.items, worn("planner-mug", "planner"), worn("book-mug", "book")],
        };
      },
    });
    const strip = await screen.findByRole("group", { name: "캐릭터 고르기" });
    const layers = (name: string) =>
      [
        ...within(strip)
          .getByRole("button", { name })
          .querySelectorAll("img[data-slot^='accessory-']"),
      ].map((img) => img.getAttribute("src"));
    expect(layers("부기")).toEqual(["/book-mug.png"]);
    expect(layers("플래니, 아직 잠겨 있어요")).toEqual([]);
  });

  it("잠긴 마스코트는 자물쇠와 함께 보이고, 고르면 잠김 안내와 마스코트 모으기가 나온다", async () => {
    renderScreen(createFakePointsGateway("default"));
    expect(await screen.findByRole("button", { name: "락키, 아직 잠겨 있어요" })).toBeVisible();
    expect(screen.getByRole("button", { name: "타이미, 고른 캐릭터" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "락키, 아직 잠겨 있어요" }));
    expect(screen.getByText("락키는 아직 잠겨 있어요")).toBeVisible();
    expect(screen.getByText("순공 4시간 12분 더 하면 열려요.")).toBeVisible();
    expect(screen.queryByRole("group", { name: "소품 고르기" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "캐릭터 모으기" }));
    expect(screen.getByText("마스코트 화면")).toBeVisible();
  });

  it("고른 소품에 따라 아래 버튼 문구가 바뀐다", async () => {
    renderScreen(createFakePointsGateway("default"));
    expect(await screen.findByRole("button", { name: "600P로 구매" })).toBeEnabled();
    expect(screen.getByText("왕관 미리 보기")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "몸 장식" }));
    await userEvent.click(screen.getByRole("button", { name: "단추 리본, 가지고 있어요" }));
    await userEvent.click(screen.getByRole("button", { name: "착용하기" }));
    expect(await screen.findByRole("button", { name: "벗기" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "머리 위" }));
    await userEvent.click(screen.getByRole("button", { name: "학사모, 순공 100시간 보상" }));
    const reward = screen.getByRole("button", { name: "누적 순공 25 / 100시간" });
    expect(reward).toBeDisabled();
    expect(screen.getByRole("img", { name: "순공 100시간 중 25시간" })).toBeVisible();
  });

  it("고른 입은 소품 칸을 한 번 더 누르면 벗고 그 칸은 고른 채 보유로 바뀐다", async () => {
    renderScreen(createFakePointsGateway("default"));
    await userEvent.click(await screen.findByRole("button", { name: "몸 장식" }));
    await userEvent.click(screen.getByRole("button", { name: "단추 리본, 가지고 있어요" }));
    await userEvent.click(screen.getByRole("button", { name: "착용하기" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "단추 리본, 착용 중. 한 번 더 누르면 벗어요" }),
    );
    expect(
      await screen.findByRole("button", { name: "단추 리본, 가지고 있어요", pressed: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "착용하기" })).toBeEnabled();
  });

  it("입은 소품을 고르면 아래 버튼이 벗기가 되고 누르면 벗는다", async () => {
    renderScreen(createFakePointsGateway("default"));
    await userEvent.click(await screen.findByRole("button", { name: "몸 장식" }));
    await userEvent.click(screen.getByRole("button", { name: "단추 리본, 가지고 있어요" }));
    await userEvent.click(screen.getByRole("button", { name: "착용하기" }));
    await userEvent.click(await screen.findByRole("button", { name: "벗기" }));
    expect(await screen.findByRole("button", { name: "착용하기" })).toBeEnabled();
  });

  it("포인트로 사면 알림 없이 잔액이 줄고 바로 착용 요청을 보내 착용 상태가 된다", async () => {
    const gateway = createFakePointsGateway("default");
    const equip = vi.spyOn(gateway, "equipAccessory");
    renderScreen(gateway);
    await userEvent.click(await screen.findByRole("button", { name: "600P로 구매" }));
    await userEvent.click(await screen.findByRole("button", { name: "구매하기" }));
    expect(await screen.findByRole("button", { name: "벗기" })).toBeEnabled();
    expect(equip).toHaveBeenCalledWith("stopwatch", "head", "acc-stopwatch-crown");
    expect(screen.getByText("640P")).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("왕관을 구매했어요!")).not.toBeInTheDocument();
  });

  it("구매 확인 창이 열린 채 뒤로 가기를 누르면 창만 닫히고 사지 않는다", async () => {
    const gateway = createFakePointsGateway("default");
    const purchase = vi.spyOn(gateway, "purchase");
    renderScreen(gateway);
    await userEvent.click(await screen.findByRole("button", { name: "600P로 구매" }));
    expect(await screen.findByRole("button", { name: "구매하기" })).toBeInTheDocument();

    window.history.back();

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "구매하기" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "600P로 구매" })).toBeInTheDocument();
    expect(purchase).not.toHaveBeenCalled();
  });

  it("포인트가 모자라면 구매 확인 대신 모자람 창이 열린다", async () => {
    renderScreen(createFakePointsGateway("default", { balance: 100 }));
    await userEvent.click(await screen.findByRole("button", { name: "600P로 구매" }));
    await waitFor(() =>
      expect(screen.getByText("왕관을 구매하려면 500P가 더 필요해요")).toBeVisible(),
    );
    expect(screen.queryByRole("button", { name: "구매하기" })).not.toBeInTheDocument();
  });

  it("착용이 실패하면 알리고 다시 누를 수 있다", async () => {
    const base = createFakePointsGateway("default");
    renderScreen({ ...base, equipAccessory: () => Promise.reject(new Error("down")) });
    await userEvent.click(await screen.findByRole("button", { name: "몸 장식" }));
    await userEvent.click(screen.getByRole("button", { name: "단추 리본, 가지고 있어요" }));
    await userEvent.click(screen.getByRole("button", { name: "착용하기" }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("잠시 후 다시 시도해 주세요"));
    expect(screen.getByRole("button", { name: "착용하기" })).toBeEnabled();
  });
});

describe("AccessoryGrid", () => {
  const [first, second] = buildPointsFixture("default").items.filter(
    (item) => item.kind === "accessory",
  );

  it("그림이 있으면 칸에 그리고 없으면 그리지 않는다", () => {
    const { container } = render(
      <AccessoryGrid
        items={[
          { ...first, imageUrl: "/crown.png" },
          { ...second, imageUrl: null },
        ]}
        pickedId={undefined}
        storePrice={() => ({ status: "unknown" })}
        onPick={() => {}}
        onTakeOff={() => {}}
      />,
    );
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "/crown.png");
    expect(images[0]).toHaveAttribute("alt", "");
  });

  it("앞 그림이 없고 뒤 그림만 있는 소품은 뒤 그림을 칸에 그린다", () => {
    const { container } = render(
      <AccessoryGrid
        items={[{ ...first, imageUrl: null, backImageUrl: "/aura.png" }]}
        pickedId={undefined}
        storePrice={() => ({ status: "unknown" })}
        onPick={() => {}}
        onTakeOff={() => {}}
      />,
    );
    expect(container.querySelector("img")).toHaveAttribute("src", "/aura.png");
  });

  it("상점에서 누른 소품이 있으면 그 소품의 칸과 소품이 골라진 채로 열린다", async () => {
    renderScreen(
      createFakePointsGateway("default"),
      "/points/accessories?item=acc-stopwatch-ribbon",
    );
    expect(
      await screen.findByRole("button", { name: /단추 리본/, pressed: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "몸 장식", pressed: true })).toBeInTheDocument();
  });

  it("없는 소품 id로 들어오면 첫 칸의 첫 소품을 보인다", async () => {
    renderScreen(createFakePointsGateway("default"), "/points/accessories?item=nope");
    expect(
      await screen.findByRole("button", { name: "머리 위", pressed: true }),
    ).toBeInTheDocument();
  });

  describe("누른 상품 없이 전체 보기로 들어왔을 때", () => {
    /** 스톱워치가 주어진 소품들을 사서 착용한 가짜 경계 */
    async function wearing(...keys: string[]) {
      const gateway = createFakePointsGateway("default", { balance: 5000 });
      const { items } = await gateway.getShop();
      for (const key of keys) {
        const item = items.find((it) => it.id === `acc-stopwatch-${key}`);
        if (item?.slot === undefined) throw new Error(`고정 데이터에 ${key} 소품이 없다`);
        if (!item.owned) await gateway.purchase(item.id);
        await gateway.equipAccessory("stopwatch", item.slot, item.id);
      }
      return gateway;
    }
    const pressed = (name: RegExp | string) => screen.findByRole("button", { name, pressed: true });

    it("착용 중인 소품이 없으면 지금처럼 머리 위 칸의 첫 소품을 고른다", async () => {
      renderScreen(createFakePointsGateway("default"));
      expect(await pressed("머리 위")).toBeInTheDocument();
      expect(await pressed(/왕관/)).toBeInTheDocument();
    });

    it("착용 중인 소품이 있는 칸과 그 소품을 처음에 고른다", async () => {
      renderScreen(await wearing("ribbon"));
      expect(await pressed("몸 장식")).toBeInTheDocument();
      expect(await pressed(/단추 리본/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "벗기" })).toBeEnabled();
    });

    it("착용 중인 소품이 여러 칸에 있으면 칩 순서에서 가장 앞 칸을 고른다", async () => {
      renderScreen(await wearing("ribbon", "glasses"));
      expect(await pressed("얼굴")).toBeInTheDocument();
      expect(await pressed(/동그란 안경/)).toBeInTheDocument();
    });

    it("그 칸의 첫 소품이 아니어도 착용 중인 소품을 고른다", async () => {
      renderScreen(await wearing("raincoat"));
      expect(await pressed("머리 위")).toBeInTheDocument();
      expect(await pressed(/우비 모자/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /왕관/ })).toHaveAttribute("aria-pressed", "false");
    });

    it("칸을 바꾸면 그 칸에서 착용 중인 소품을 먼저 고른다", async () => {
      renderScreen(await wearing("raincoat", "glasses"));
      // 칩 순서에서 앞인 머리 위 칸이 먼저 열리고, 얼굴 칸으로 갔다가 돌아와도 착용 중인 소품이 골라져 있다.
      await userEvent.click(await screen.findByRole("button", { name: "얼굴" }));
      expect(await pressed(/동그란 안경/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "머리 위" }));
      expect(await pressed(/우비 모자/)).toBeInTheDocument();
    });

    it("사용자가 직접 고른 뒤에는 착용 중인 소품으로 되돌리지 않는다", async () => {
      renderScreen(await wearing("raincoat"));
      await userEvent.click(await screen.findByRole("button", { name: /왕관/ }));
      expect(await pressed(/왕관/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /우비 모자/ })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });
  });

  describe("마스코트를 바꿀 때", () => {
    const pressed = (name: RegExp | string) => screen.findByRole("button", { name, pressed: true });
    const pickMascot = async (name: string) =>
      userEvent.click(
        within(await screen.findByRole("group", { name: "캐릭터 고르기" })).getByRole("button", {
          name,
        }),
      );

    it("새 마스코트가 낀 칸과 소품을 처음 선택으로 보인다", async () => {
      const gateway = createFakePointsGateway("default", { balance: 5000 });
      await gateway.purchase("acc-book-bookmark");
      await gateway.equipAccessory("book", "head", "acc-book-bookmark");
      const getShop = gateway.getShop.bind(gateway);
      const glasses = {
        id: "book-glasses",
        kind: "accessory" as const,
        name: "부기 안경",
        imageUrl: null,
        acquire: { type: "price" as const, price: 100 },
        owned: true,
        inUse: true,
        mascotId: "book" as const,
        slot: "face" as const,
      };
      renderScreen({
        ...gateway,
        getShop: async () => {
          const shop = await getShop();
          // 머리 위 칸 책갈피 핀은 벗기고 얼굴 칸 안경만 낀 부기
          return {
            ...shop,
            items: [
              ...shop.items.map((it) =>
                it.id === "acc-book-bookmark" ? { ...it, inUse: false } : it,
              ),
              glasses,
            ],
          };
        },
      });
      expect(await pressed("머리 위")).toBeInTheDocument();

      await pickMascot("부기");

      expect(await pressed("얼굴")).toBeInTheDocument();
      expect(await pressed(/부기 안경/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "벗기" })).toBeEnabled();
    });

    it("다른 마스코트에서 소품을 벗고 돌아와도 원래 마스코트의 착용과 처음 선택이 그대로다", async () => {
      const gateway = createFakePointsGateway("default", { balance: 5000 });
      await gateway.equipAccessory("stopwatch", "body", "acc-stopwatch-ribbon");
      await gateway.purchase("acc-book-bookmark");
      await gateway.equipAccessory("book", "head", "acc-book-bookmark");
      renderScreen(gateway);
      expect(await pressed(/단추 리본/)).toBeInTheDocument();
      // 타이미에서 다른 소품을 골라 둔 채 마스코트를 바꾼다.
      await userEvent.click(screen.getByRole("button", { name: "머리 위" }));
      await userEvent.click(await screen.findByRole("button", { name: /왕관/ }));

      await pickMascot("부기");
      expect(await pressed(/책갈피 핀/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "벗기" }));
      await waitFor(() => expect(screen.queryByRole("button", { name: "벗기" })).toBeNull());

      await pickMascot("타이미");
      expect(await pressed("몸 장식")).toBeInTheDocument();
      expect(await pressed(/단추 리본/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "벗기" })).toBeEnabled();
    });
  });

  it("누른 상품이 있으면 착용 중인 소품이 다른 칸에 있어도 누른 상품을 고른다", async () => {
    const gateway = createFakePointsGateway("default");
    await gateway.equipAccessory("stopwatch", "body", "acc-stopwatch-ribbon");
    renderScreen(gateway, "/points/accessories?item=acc-stopwatch-crown");
    expect(await screen.findByRole("button", { name: /왕관/, pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "머리 위", pressed: true })).toBeInTheDocument();
  });
});
