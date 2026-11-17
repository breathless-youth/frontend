import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { trackPointsStorePurchase } from "@/lib/amplitude";
import { pointsKeys, storePricesQuery } from "@/lib/pointsQueries";

import { usePointsGateway, usePointsUserId } from "../gateway/PointsGatewayContext";
import type { ShopItem } from "../types";
import { useMemberOnly } from "./useMemberOnly";

export type StorePurchaseStep = "idle" | "paying" | "waiting" | "late" | "failed" | "done";

/**
 * 스토어 결제로 상품을 사는 흐름
 *
 * 가격 문구는 스토어가 알려 주고, 산 상품은 서버가 결제 알림을 받은 뒤에 보유로 바뀐다.
 * 결제를 맡을 수 없는 곳(브라우저, 예전 앱)에서는 available이 false라 화면이 살 길 대신 안내를 보인다.
 * 결제 창이 떠 있는 동안 버튼을 다시 눌러도 요청이 한 번만 나가게 ref로 막는다.
 * 취소는 사용자가 고른 일이라 알리지 않고 처음으로 돌아간다.
 * 결제는 회원만 하므로 비회원이 누르면 결제 창 대신 로그인 화면을 연다.
 * 회원으로 알았는데 서버가 결제용 ID를 주지 않으면 결제 창을 열지 않고 같은 로그인 화면으로 보낸다.
 */
export function useStorePurchase(items: readonly ShopItem[]) {
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<StorePurchaseStep>("idle");
  const [target, setTarget] = useState<ShopItem | null>(null);
  const inFlightRef = useRef(false);
  const memberOnly = useMemberOnly();
  const productIds = [
    ...new Set(
      items.flatMap((item) => (item.acquire.type === "store" ? [item.acquire.productId] : [])),
    ),
  ].sort();
  const prices = useQuery(storePricesQuery(gateway, userId, productIds)).data;

  async function buy(item: ShopItem) {
    if (item.acquire.type !== "store" || item.owned || inFlightRef.current) {
      return;
    }
    if (!memberOnly.allow()) {
      return;
    }
    inFlightRef.current = true;
    setTarget(item);
    setStep("paying");
    const kind = item.slot === "set" ? "set" : item.kind;
    trackPointsStorePurchase("attempted", kind);
    try {
      const result = await gateway.purchaseStoreItem(item.id, () => setStep("waiting"));
      trackPointsStorePurchase(result.status, kind);
      setStep(
        result.status === "completed"
          ? "done"
          : result.status === "cancelled"
            ? "idle"
            : result.status,
      );
    } catch (error) {
      trackPointsStorePurchase("failed", kind);
      setStep(memberOnly.redirected(error) ? "idle" : "failed");
    } finally {
      inFlightRef.current = false;
      void queryClient.invalidateQueries({ queryKey: pointsKeys.shop(userId) });
    }
  }

  return {
    available: gateway.capabilities.storeItems,
    step,
    target,
    priceLabel: (item: ShopItem) =>
      item.acquire.type === "store" ? (prices?.[item.acquire.productId] ?? null) : null,
    buy,
    retry: () => (target === null ? undefined : void buy(target)),
    close: () => setStep("idle"),
  };
}
