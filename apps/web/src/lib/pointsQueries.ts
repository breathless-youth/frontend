import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import type { PointsGateway } from "@/features/points/gateway/PointsGateway";
import { recallMascotLook, rememberMascotLook } from "@/features/points/model/storedMascotLook";
import type { HistoryFilter } from "@/features/points/types";

import { isPointsEnabled } from "./pointsCapability";

export const pointsKeys = {
  all: ["points"] as const,
  user: (userId: number) => ["points", userId] as const,
  balance: (userId: number) => ["points", userId, "balance"] as const,
  shop: (userId: number) => ["points", userId, "shop"] as const,
  look: (userId: number) => ["points", userId, "look"] as const,
  /** 모든 기록 필터를 함께 다시 받을 때 쓰는 앞머리 */
  histories: (userId: number) => ["points", userId, "history"] as const,
  history: (userId: number, filter: HistoryFilter) =>
    ["points", userId, "history", filter] as const,
  earnToday: (userId: number) => ["points", userId, "earnToday"] as const,
  chargePacks: (userId: number) => ["points", userId, "chargePacks"] as const,
  storePrices: (userId: number, productIds: readonly string[]) =>
    ["points", userId, "storePrices", productIds] as const,
};

/**
 * 잔액 queryOptions
 *
 * 다른 화면의 구매·받기로 바뀌므로 신선하다고 보지 않고, 바뀐 값은 경계가 돌려준 잔액으로 바로 덮는다.
 */
export function balanceQuery(gateway: PointsGateway, userId: number) {
  return queryOptions({
    queryKey: pointsKeys.balance(userId),
    queryFn: () => gateway.getBalance(),
    staleTime: 0,
  });
}

export function shopQuery(gateway: PointsGateway, userId: number) {
  return queryOptions({
    queryKey: pointsKeys.shop(userId),
    queryFn: () => gateway.getShop(),
    staleTime: 60_000,
  });
}

/**
 * 내 마스코트 모습 queryOptions
 *
 * 상점 밖 화면(결과, 프로필)이 읽고, 상점에서 마스코트나 소품을 바꾸면 다시 받는다.
 * 받은 모습은 기기에 남기고, 새 웹뷰의 빈 캐시는 그 값으로 시작해 처음 그림부터 고른 마스코트가 나온다.
 * 남긴 값은 언제 받았는지 모르는 값으로 보고(`initialDataUpdatedAt: 0`) 화면에 붙거나 미리 받을 때 서버에서 다시 받는다.
 * 포인트가 꺼진 문서는 남긴 값을 읽지 않는다.
 */
export function lookQuery(gateway: PointsGateway, userId: number) {
  return queryOptions({
    queryKey: pointsKeys.look(userId),
    queryFn: async () => {
      const look = await gateway.getMyLook();
      rememberMascotLook(userId, look);
      return look;
    },
    staleTime: 60_000,
    initialData: () => (isPointsEnabled() ? recallMascotLook(userId) : undefined),
    initialDataUpdatedAt: 0,
  });
}

/** 커서로 이어 받는 기록이며 구매·받기마다 바뀌어 신선하다고 보지 않는다. */
export function historyQuery(gateway: PointsGateway, userId: number, filter: HistoryFilter) {
  return infiniteQueryOptions({
    queryKey: pointsKeys.history(userId, filter),
    queryFn: ({ pageParam }) => gateway.getHistory(filter, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 0,
  });
}

/** 공부·광고로 하루 중에도 바뀌어 신선하다고 보지 않는다. */
export function earnTodayQuery(gateway: PointsGateway, userId: number) {
  return queryOptions({
    queryKey: pointsKeys.earnToday(userId),
    queryFn: () => gateway.getEarnToday(),
    staleTime: 0,
  });
}

/** 묶음 구성과 스토어 가격은 자주 바뀌지 않는다. */
export function chargePacksQuery(gateway: PointsGateway, userId: number) {
  return queryOptions({
    queryKey: pointsKeys.chargePacks(userId),
    queryFn: () => gateway.getChargePacks(),
    staleTime: 10 * 60_000,
  });
}

/** 스토어 결제 상품의 가격 문구이며 가격과 통화는 스토어가 정해서 자주 바뀌지 않는다. */
export function storePricesQuery(
  gateway: PointsGateway,
  userId: number,
  productIds: readonly string[],
) {
  return queryOptions({
    queryKey: pointsKeys.storePrices(userId, productIds),
    queryFn: () => gateway.getStorePrices([...productIds]),
    staleTime: 10 * 60_000,
    enabled: productIds.length > 0 && gateway.capabilities.storeItems,
  });
}
