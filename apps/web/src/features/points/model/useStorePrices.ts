import { useQuery } from "@tanstack/react-query";

import { storePricesQuery } from "@/lib/pointsQueries";

import { usePointsGateway, usePointsUserId } from "../gateway/PointsGatewayContext";
import type { ShopItem } from "../types";

/** 스토어 결제 상품 하나의 가격 자리 */
export type StorePrice =
  | { status: "pending" }
  | { status: "known"; label: string }
  /** 묻지 않았거나(브라우저, 예전 앱, 비회원) 묻고도 받지 못한 가격 */
  | { status: "unknown" };

/**
 * 스토어 결제 상품의 가격
 *
 * 가격 문구는 셸이 스토어에서 받은 현지 통화 문구라 웹에서 통화를 바꾸거나 다시 꾸미지 않는다.
 * 받는 동안만 pending이다.
 * 결제를 맡을 수 없는 곳은 묻지 않아서 pending에 머물지 않고 바로 unknown이다.
 */
export function useStorePrices(items: readonly ShopItem[]): (item: ShopItem) => StorePrice {
  const gateway = usePointsGateway();
  const userId = usePointsUserId();
  const productIds = [
    ...new Set(
      items.flatMap((item) => (item.acquire.type === "store" ? [item.acquire.productId] : [])),
    ),
  ].sort();
  // 꺼진 조회도 isPending이라 실제로 받는 중인지는 isLoading으로 본다.
  const { data, isLoading } = useQuery(storePricesQuery(gateway, userId, productIds));
  return (item) => {
    if (item.acquire.type !== "store") {
      return { status: "unknown" };
    }
    const label = data?.[item.acquire.productId];
    if (label !== undefined) {
      return { status: "known", label };
    }
    return isLoading ? { status: "pending" } : { status: "unknown" };
  };
}
