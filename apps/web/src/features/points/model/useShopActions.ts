import { useQueryClient } from "@tanstack/react-query";

import {
  trackPointsAdWatched,
  trackPointsCharge,
  trackPointsClaimed,
  trackPointsDecorationChanged,
  trackPointsMascotSelected,
} from "@/lib/amplitude";
import { isNativeBridgeAvailable } from "@/lib/bridge";
import { pointsKeys } from "@/lib/pointsQueries";

import { usePointsGateway, usePointsUserId } from "../gateway/PointsGatewayContext";
import type { AccessorySlot, AdResult, ChargeResult, ClaimKind, MascotId } from "../types";
import { useMemberOnly } from "./useMemberOnly";

const LATE_BALANCE_REFETCH_MS = [10_000, 30_000, 60_000, 180_000];

/**
 * 포인트 화면이 경계에 거는 변경과 그 뒤처리
 *
 * 잔액은 경계가 돌려준 값으로 바로 덮고, 오늘 받은 것·기록·상점은 다시 받는다.
 * 실패는 다시 throw해서 부른 화면이 자기 방식(창이나 알림)으로 알린다.
 * 광고와 충전은 앱 안이면서 경계가 지원할 때만 처리기를 주고, 아니면 화면이 그 줄을 숨긴다.
 * 꾸미기 저장은 회원만 하므로 비회원이면 요청을 보내지 않고 로그인 화면을 연다.
 * 받기·광고·충전은 결과를 돌려줘야 해서 부르는 화면이 누르는 순간에 같은 문으로 막는다.
 * 서버가 회원 전용이라고 거절하면 로그인 화면을 열고 오류는 다시 throw한다.
 */
export function useShopActions() {
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const queryClient = useQueryClient();
  const memberOnly = useMemberOnly();

  /** 서버의 회원 전용 거절을 로그인 화면으로 보내고 오류는 부른 쪽에 그대로 넘긴다. */
  const guarded = async <T>(request: () => Promise<T>): Promise<T> => {
    try {
      return await request();
    } catch (error) {
      memberOnly.redirected(error);
      throw error;
    }
  };

  const settle = (balance: number) => {
    queryClient.setQueryData(pointsKeys.balance(userId), balance);
    void queryClient.invalidateQueries({ queryKey: pointsKeys.earnToday(userId) });
    void queryClient.invalidateQueries({ queryKey: pointsKeys.histories(userId) });
  };
  // 늦게 들어온 포인트가 화면에 보이도록 잔액과 오늘 받은 것을 몇 번 더 읽는다.
  const refetchLater = () => {
    for (const delayMs of LATE_BALANCE_REFETCH_MS) {
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: pointsKeys.user(userId) });
      }, delayMs);
    }
  };
  const refetchShop = () => queryClient.invalidateQueries({ queryKey: pointsKeys.shop(userId) });
  // 결과 화면과 프로필이 읽는 내 모습은 상점과 다른 조회라 마스코트나 소품이 바뀌면 함께 다시 받는다.
  const refetchLook = async () => {
    await Promise.all([
      refetchShop(),
      queryClient.invalidateQueries({ queryKey: pointsKeys.look(userId) }),
    ]);
  };

  const claim = async (kind: ClaimKind) => {
    try {
      const result = await guarded(() => gateway.claim(kind));
      if (result.granted) trackPointsClaimed({ kind, points: result.points });
      settle(result.balance);
      return result;
    } catch (error) {
      // 이미 받았거나 받을 수 없게 된 보상은 서버 상태에 맞춰 화면을 다시 그린다.
      void queryClient.invalidateQueries({ queryKey: pointsKeys.earnToday(userId) });
      throw error;
    }
  };
  const watchAd = async (): Promise<AdResult> => {
    const result = await guarded(() => gateway.watchAd());
    trackPointsAdWatched(result.status);
    if (result.status === "rewarded") settle(result.balance);
    if (result.status === "late") refetchLater();
    return result;
  };
  const charge = async (productId: string, onPaid?: () => void): Promise<ChargeResult> => {
    const result = await guarded(() => gateway.charge(productId, onPaid));
    trackPointsCharge(result.status, productId);
    if (result.status === "completed") settle(result.balance);
    if (result.status === "late") refetchLater();
    return result;
  };
  const equipAccessory = async (mascotId: MascotId, slot: AccessorySlot, itemId: string | null) => {
    if (!memberOnly.allow()) return;
    await guarded(() => gateway.equipAccessory(mascotId, slot, itemId));
    trackPointsDecorationChanged({
      kind: "accessory",
      action: itemId === null ? "off" : "on",
      slot,
    });
    await refetchLook();
  };
  const setTimerBackground = async (itemId: string | null) => {
    if (!memberOnly.allow()) return;
    await guarded(() => gateway.setTimerBackground(itemId));
    trackPointsDecorationChanged({
      kind: "timerBackground",
      action: itemId === null ? "off" : "on",
    });
    await refetchShop();
  };
  const selectMascot = async (id: MascotId) => {
    if (!memberOnly.allow()) return;
    await guarded(() => gateway.selectMascot(id));
    trackPointsMascotSelected(id);
    await refetchLook();
  };
  const markUnlocksSeen = async () => {
    await gateway.markUnlocksSeen();
    await refetchShop();
  };

  const inApp = isNativeBridgeAvailable();
  const { ads, charge: canCharge } = gateway.capabilities;
  return {
    inApp,
    /** 받기·광고·충전 버튼이 누르는 순간에 부르는 문이며 비회원이면 로그인 화면을 열고 false를 준다. */
    allowMemberAction: memberOnly.allow,
    claim,
    equipAccessory,
    setTimerBackground,
    selectMascot,
    markUnlocksSeen,
    watchAd: inApp && ads ? watchAd : undefined,
    charge: inApp && canCharge ? charge : undefined,
  };
}
