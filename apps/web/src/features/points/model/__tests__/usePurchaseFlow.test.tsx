import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { pointsKeys } from "@/lib/pointsQueries";
import { showToast } from "@/lib/toast";

import { createFakePointsGateway } from "../../gateway/createFakePointsGateway";
import type { PointsGateway } from "../../gateway/PointsGateway";
import { PointsGatewayProvider } from "../../gateway/PointsGatewayContext";
import type { ShopItem } from "../../types";
import { usePurchaseFlow } from "../usePurchaseFlow";

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));

const USER = 7;

async function setup(balance: number, guest?: { requestLogin: () => void }) {
  const gateway = createFakePointsGateway("default", { balance });
  const purchase = vi.spyOn(gateway, "purchase");
  const crown = (await gateway.getShop()).items.find((it) => it.id === "acc-stopwatch-crown")!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <PointsGatewayProvider
        gateway={gateway}
        userId={USER}
        member={guest === undefined}
        requestLogin={guest?.requestLogin}
      >
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

/** 회원으로 준비하되 로그인 화면을 여는지 볼 수 있게 한다. */
async function setupMember() {
  const requestLogin = vi.fn();
  const gateway = createFakePointsGateway("default", { balance: 1240 });
  const purchase = vi.spyOn(gateway, "purchase");
  const crown = (await gateway.getShop()).items.find((it) => it.id === "acc-stopwatch-crown")!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <PointsGatewayProvider gateway={gateway} userId={USER} requestLogin={requestLogin}>
        {children}
      </PointsGatewayProvider>
    </QueryClientProvider>
  );
  const view = renderHook(() => usePurchaseFlow(crown), { wrapper });
  await waitFor(() => expect(client.getQueryData(pointsKeys.balance(USER))).toBe(1240));
  return { view, purchase, requestLogin };
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

  it("비회원이 열면 확인 창도 모자람 창도 열지 않고 로그인 화면을 연다", async () => {
    const requestLogin = vi.fn();
    const { view, purchase } = await setup(1240, { requestLogin });
    act(() => view.result.current.open());
    expect(view.result.current.step).toBe("idle");
    expect(requestLogin).toHaveBeenCalledOnce();
    expect(purchase).not.toHaveBeenCalled();
  });

  it("서버가 구매를 회원 전용이라고 거절하면 창을 닫고 로그인 화면을 열며 다시 시도하라고 알리지 않는다", async () => {
    const { view, purchase, requestLogin } = await setupMember();
    purchase.mockRejectedValue(new ApiError("member only", 403, "MEMBER_ONLY"));
    vi.mocked(showToast).mockClear();
    act(() => view.result.current.open());
    await act(() => view.result.current.confirm());
    expect(view.result.current.step).toBe("idle");
    expect(requestLogin).toHaveBeenCalledOnce();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("충전하고 구매하기에서 결제를 스스로 취소하면 알리지 않고 사지도 않는다", async () => {
    const { view, purchase } = await setup(100);
    vi.mocked(showToast).mockClear();
    await act(() => view.result.current.chargeAndBuy(async () => ({ status: "cancelled" })));
    expect(showToast).not.toHaveBeenCalled();
    expect(purchase).not.toHaveBeenCalled();
  });

  it("충전하고 구매하기에서 결제가 실패하면 실패를 알린다", async () => {
    const { view, purchase } = await setup(100);
    vi.mocked(showToast).mockClear();
    await act(() => view.result.current.chargeAndBuy(async () => ({ status: "failed" })));
    expect(showToast).toHaveBeenCalledOnce();
    expect(purchase).not.toHaveBeenCalled();
  });

  it("모자람 창의 광고 보상이 409로 거절되면 출시 뒤에 받을 수 있다고 알리고 다음 광고는 띄우지 않는다", async () => {
    const { view } = await setup(100);
    const watchAd = vi.fn(() =>
      Promise.reject(new ApiError("not yet", 409, "REWARD_NOT_AVAILABLE")),
    );
    vi.mocked(showToast).mockClear();
    await act(() => view.result.current.watchAdForPoints(watchAd));
    await act(() => view.result.current.watchAdForPoints(watchAd));
    expect(watchAd).toHaveBeenCalledOnce();
    expect(showToast).toHaveBeenCalledTimes(2);
    expect(showToast).toHaveBeenNthCalledWith(1, "포인트는 정식 출시 후부터 받을 수 있어요");
    expect(showToast).toHaveBeenNthCalledWith(2, "포인트는 정식 출시 후부터 받을 수 있어요");
  });

  it("모자람 창의 광고가 다른 이유로 실패하면 지금처럼 다시 시도하라고 알리고 다음 광고도 띄운다", async () => {
    const { view } = await setup(100);
    const watchAd = vi.fn(() => Promise.reject(new ApiError("x", 409, "ALREADY_CLAIMED")));
    vi.mocked(showToast).mockClear();
    await act(() => view.result.current.watchAdForPoints(watchAd));
    await act(() => view.result.current.watchAdForPoints(watchAd));
    expect(watchAd).toHaveBeenCalledTimes(2);
    expect(showToast).toHaveBeenCalledWith("잠시 후 다시 시도해 주세요");
    expect(showToast).not.toHaveBeenCalledWith("포인트는 정식 출시 후부터 받을 수 있어요");
  });
});
