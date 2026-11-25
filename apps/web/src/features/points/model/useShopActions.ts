import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  trackPointsAdWatched,
  trackPointsCharge,
  trackPointsClaimed,
  trackPointsDecorationChanged,
  trackPointsMascotSelected,
} from "@/lib/amplitude";
import { isNativeBridgeAvailable } from "@/lib/bridge";
import { lookQuery, pointsKeys } from "@/lib/pointsQueries";

import { usePointsGateway, usePointsUserId } from "../gateway/PointsGatewayContext";
import type { AccessorySlot, AdResult, ChargeResult, ClaimKind, MascotId } from "../types";
import { isAdsHiddenHere } from "./adRegion";
import { forgetMascotLook } from "./storedMascotLook";
import { useMemberOnly } from "./useMemberOnly";

const LATE_BALANCE_REFETCH_MS = [10_000, 30_000, 60_000, 180_000];

/**
 * 포인트 화면이 경계에 거는 변경과 그 뒤처리
 *
 * 잔액은 경계가 돌려준 값으로 바로 덮고, 오늘 받은 것·기록·상점은 다시 받는다.
 * 실패는 다시 throw해서 부른 화면이 자기 방식(창이나 알림)으로 알린다.
 * 광고와 충전은 앱 안이면서 경계가 지원할 때만 처리기를 주고, 아니면 화면이 그 줄을 숨긴다.
 * 광고는 `adRegion.ts`가 숨기라고 판정한 유럽 기기에도 처리기를 주지 않는다.
 * 꾸미기 저장은 회원만 하므로 비회원이면 요청을 보내지 않고 로그인 화면을 연다.
 * 받기와 광고는 비회원도 하므로 문 없이 요청을 보낸다.
 * 충전은 결과를 돌려줘야 해서 부르는 화면이 누르는 순간에 같은 문으로 막는다.
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
  /**
   * 결과 화면과 프로필이 읽는 내 모습은 상점과 다른 조회라 마스코트나 소품이 바뀌면 함께 다시 받는다.
   * 이 문서에서 그 조회를 보는 화면이 없어도 바로 받아서, 기기에 남긴 모습도 새 모습으로 바꾼다.
   * 세션은 새 웹뷰에서 열려 그 값을 처음 그림으로 쓴다.
   * 받지 못하면 지난 모습이 다음 웹뷰에 그려지지 않게 남긴 값을 지우고 다음에 다시 받게 둔다.
   */
  const refetchLook = async () => {
    const fetchLook = queryClient.fetchQuery({ ...lookQuery(gateway, userId), staleTime: 0 }).then(
      () => undefined,
      () => {
        forgetMascotLook();
        return queryClient.invalidateQueries({ queryKey: pointsKeys.look(userId) });
      },
    );
    await Promise.all([refetchShop(), fetchLook]);
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
    await Promise.all([
      refetchLook(),
      queryClient.invalidateQueries({ queryKey: pointsKeys.wornAccessories(userId) }),
    ]);
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
  const adsShown = useMemo(() => !isAdsHiddenHere(), []);
  return {
    inApp,
    /** 이 기기의 지역에 광고 입구를 그리는지 여부이며 거짓이면 받기 탭의 광고 타일도 그리지 않는다. */
    adsShown,
    /** 충전 버튼이 누르는 순간에 부르는 문이며 비회원이면 로그인 화면을 열고 false를 준다. */
    allowMemberAction: memberOnly.allow,
    claim,
    equipAccessory,
    setTimerBackground,
    selectMascot,
    markUnlocksSeen,
    watchAd: inApp && ads && adsShown ? watchAd : undefined,
    charge: inApp && canCharge ? charge : undefined,
  };
}
