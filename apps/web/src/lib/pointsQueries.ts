import { queryOptions } from "@tanstack/react-query";

import type { PointsGateway } from "@/features/points/gateway/PointsGateway";
import type { HistoryFilter } from "@/features/points/types";

export const pointsKeys = {
  all: ["points"] as const,
  user: (userId: number) => ["points", userId] as const,
  balance: (userId: number) => ["points", userId, "balance"] as const,
  shop: (userId: number) => ["points", userId, "shop"] as const,
  history: (userId: number, filter: HistoryFilter) =>
    ["points", userId, "history", filter] as const,
  earnToday: (userId: number) => ["points", userId, "earnToday"] as const,
  chargePacks: (userId: number) => ["points", userId, "chargePacks"] as const,
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

export function historyQuery(gateway: PointsGateway, userId: number, filter: HistoryFilter) {
  return queryOptions({
    queryKey: pointsKeys.history(userId, filter),
    queryFn: () => gateway.getHistory(filter),
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
