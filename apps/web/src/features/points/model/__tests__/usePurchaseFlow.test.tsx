import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { pointsKeys } from "@/lib/pointsQueries";
import { showToast } from "@/lib/toast";

import { createFakePointsGateway } from "../../gateway/createFakePointsGateway";
import type { PointsGateway } from "../../gateway/PointsGateway";
import { PointsGatewayProvider } from "../../gateway/PointsGatewayContext";
import type { ShopItem } from "../../types";
import { usePurchaseFlow } from "../usePurchaseFlow";

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

const USER = 7;

async function setup(balance: number) {
  const gateway = createFakePointsGateway("default", { balance });
  const purchase = vi.spyOn(gateway, "purchase");
  const crown = (await gateway.getShop()).items.find((it) => it.id === "acc-stopwatch-crown")!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <PointsGatewayProvider gateway={gateway} userId={USER}>
        {children}
      </PointsGatewayProvider>
    </QueryClientProvider>
  );
  const view = renderHook(({ item }: { item: ShopItem | null }) => usePurchaseFlow(item), {
    wrapper,
    initialProps: { item: crown },
  });
  await waitFor(() => expect(client.getQueryData(pointsKeys.balance(USER))).toBe(balance));
  return { view, purchase, client, gateway: gateway as PointsGateway };
}

describe("usePurchaseFlow", () => {
  it("확인을 연달아 두 번 눌러도 한 번만 산다", async () => {
    const { view, purchase, client } = await setup(1240);
    act(() => view.result.current.open());
    expect(view.result.current.step).toBe("confirm");
    expect(view.result.current.balanceAfter).toBe(640);
    await act(async () => {
      void view.result.current.confirm();
      await view.result.current.confirm();
    });
    expect(purchase).toHaveBeenCalledTimes(1);
    expect(view.result.current.step).toBe("done");
    expect(client.getQueryData(pointsKeys.balance(USER))).toBe(640);
  });

  it("잔액이 모자라면 모자람 단계로 연다", async () => {
    const { view, purchase } = await setup(480);
    act(() => view.result.current.open());
    expect(view.result.current.step).toBe("insufficient");
    expect(purchase).not.toHaveBeenCalled();
  });

  it("잔액이 가격과 같으면 사고 0이 남는다", async () => {
    const { view, client } = await setup(600);
    act(() => view.result.current.open());
    expect(view.result.current.step).toBe("confirm");
    await act(() => view.result.current.confirm());
    expect(view.result.current.step).toBe("done");
    expect(view.result.current.balanceAfter).toBe(0);
    expect(client.getQueryData(pointsKeys.balance(USER))).toBe(0);
  });

  it("닫으면 처음 단계로 돌아간다", async () => {
    const { view } = await setup(1240);
    act(() => view.result.current.open());
    act(() => view.result.current.close());
    expect(view.result.current.step).toBe("idle");
  });

  it.each(["notPurchasable", "notFound"] as const)(
    "%s로 거절되면 창을 닫고 일반 안내를 띄운다",
    async (reason) => {
      const { view, purchase } = await setup(1240);
      purchase.mockResolvedValue({ ok: false, reason });
      act(() => view.result.current.open());
      await act(() => view.result.current.confirm());
      expect(view.result.current.step).toBe("idle");
      expect(showToast).toHaveBeenCalledWith("잠시 후 다시 시도해 주세요");
    },
  );
});
