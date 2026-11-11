import { useQueryClient } from "@tanstack/react-query";

import { isNativeBridgeAvailable } from "@/lib/bridge";
import { pointsKeys } from "@/lib/pointsQueries";

import { usePointsGateway, usePointsUserId } from "../gateway/PointsGatewayContext";
import type { AdResult, ChargeResult, ClaimKind, MascotId } from "../types";

/**
 * 포인트 화면이 경계에 거는 변경과 그 뒤처리
 *
 * 잔액은 경계가 돌려준 값으로 바로 덮고, 오늘 받은 것·기록·상점은 다시 받는다.
 * 실패는 그대로 던져서 부른 화면이 자기 방식(창이나 알림)으로 알린다.
 * 광고와 충전은 앱 안에서만 되므로 앱 밖에서는 처리기를 주지 않아 화면이 그 줄을 숨긴다.
 */
export function useShopActions() {
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const queryClient = useQueryClient();

  const settle = (balance: number) => {
    queryClient.setQueryData(pointsKeys.balance(userId), balance);
    void queryClient.invalidateQueries({ queryKey: pointsKeys.earnToday(userId) });
    void queryClient.invalidateQueries({ queryKey: [...pointsKeys.user(userId), "history"] });
  };
  const refetchShop = () => queryClient.invalidateQueries({ queryKey: pointsKeys.shop(userId) });

  const claim = async (kind: ClaimKind) => {
    const result = await gateway.claim(kind);
    settle(result.balance);
    return result;
  };
  const watchAd = async (): Promise<AdResult> => {
    const result = await gateway.watchAd();
    if (result.status === "rewarded") settle(result.balance);
    return result;
  };
  const charge = async (productId: string): Promise<ChargeResult> => {
    const result = await gateway.charge(productId);
    if (result.status === "completed") settle(result.balance);
    return result;
  };
  const setInUse = async (itemId: string, inUse: boolean) => {
    await gateway.setInUse(itemId, inUse);
    await refetchShop();
  };
  const selectMascot = async (id: MascotId) => {
    await gateway.selectMascot(id);
    await refetchShop();
  };

  const inApp = isNativeBridgeAvailable();
  return {
    inApp,
    claim,
    setInUse,
    selectMascot,
    watchAd: inApp ? watchAd : undefined,
    charge: inApp ? charge : undefined,
  };
}
