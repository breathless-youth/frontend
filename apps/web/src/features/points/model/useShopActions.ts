import { useQueryClient } from "@tanstack/react-query";

import { isNativeBridgeAvailable } from "@/lib/bridge";
import { pointsKeys } from "@/lib/pointsQueries";

import { usePointsGateway, usePointsUserId } from "../gateway/PointsGatewayContext";
import type { AccessorySlot, AdResult, ChargeResult, ClaimKind, MascotId } from "../types";

/**
 * 포인트 화면이 경계에 거는 변경과 그 뒤처리
 *
 * 잔액은 경계가 돌려준 값으로 바로 덮고, 오늘 받은 것·기록·상점은 다시 받는다.
 * 실패는 그대로 던져서 부른 화면이 자기 방식(창이나 알림)으로 알린다.
 * 광고와 충전은 앱 안이면서 경계가 지원할 때만 처리기를 주고, 아니면 화면이 그 줄을 숨긴다.
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
    try {
      const result = await gateway.claim(kind);
      settle(result.balance);
      return result;
    } catch (error) {
      // 이미 받았거나 받을 수 없게 된 보상은 서버 상태에 맞춰 화면을 다시 그린다.
      void queryClient.invalidateQueries({ queryKey: pointsKeys.earnToday(userId) });
      throw error;
    }
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
  const equipAccessory = async (mascotId: MascotId, slot: AccessorySlot, itemId: string | null) => {
    await gateway.equipAccessory(mascotId, slot, itemId);
    await refetchShop();
  };
  const setTimerBackground = async (itemId: string | null) => {
    await gateway.setTimerBackground(itemId);
    await refetchShop();
  };
  const selectMascot = async (id: MascotId) => {
    await gateway.selectMascot(id);
    await refetchShop();
  };
  const markUnlocksSeen = async () => {
    await gateway.markUnlocksSeen();
    await refetchShop();
  };

  const inApp = isNativeBridgeAvailable();
  const { ads, charge: canCharge } = gateway.capabilities;
  return {
    inApp,
    claim,
    equipAccessory,
    setTimerBackground,
    selectMascot,
    markUnlocksSeen,
    watchAd: inApp && ads ? watchAd : undefined,
    charge: inApp && canCharge ? charge : undefined,
  };
}
