import { ApiError } from "@/lib/api";
import {
  getMascots,
  getPointProducts,
  getPointsEarn,
  getPointsBalance,
  getPointsHistory,
  getShopItems,
  getStudyReward,
  postMascotUnlocksSeen,
  postRewardClaim,
  purchaseShopItem,
  putMascotAccessory,
  putSelectedMascot,
  putTimerBackground,
} from "@/lib/pointsApi";

import { isNativePointsAdsAvailable, requestNativePointsAd } from "@/lib/nativePointsAds";
import {
  isNativePointsChargeAvailable,
  requestNativePointsPrices,
  requestNativePointsPurchase,
} from "@/lib/nativePointsCharge";

import {
  toMascotCode,
  toClaimResult,
  toEarnToday,
  toHistoryPage,
  toPurchaseFailure,
  toSessionReward,
  toShopData,
  toSlotCode,
} from "./fromApi";
import type { ClaimKind, HistoryFilter } from "../types";
import type { PointsCapabilities, PointsGateway } from "./PointsGateway";

/** 결제 알림이 서버에 닿기까지 보통 몇 초, 길면 1분쯤 걸려서 그동안 잔액을 다시 읽는다. */
const CHARGE_SETTLE_INTERVAL_MS = 2_000;
const CHARGE_SETTLE_TRIES = 30;
/** 광고 시청 확인은 광고 사업자가 서버로 직접 보내서 몇 초 늦을 수 있다. */
const AD_SETTLE_INTERVAL_MS = 2_000;
const AD_SETTLE_TRIES = 10;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const HISTORY_TYPE = { all: "ALL", earned: "EARNED", spent: "SPENT" } as const satisfies Record<
  HistoryFilter,
  string
>;

const REWARD_PATH = {
  attendance: "attendance",
  dailyGoal: "daily-goal",
  medals: "medals",
} as const satisfies Record<ClaimKind, string>;

const HISTORY_PAGE_SIZE = 30;

/** 화면의 상품 id는 서버 숫자 id를 문자열로 바꾼 것이라 보낼 때 되돌린다. */
function toServerItemId(itemId: string | null): number | null {
  return itemId === null ? null : Number(itemId);
}

/**
 * 포인트 API로 도는 경계
 *
 * 충전과 광고는 결제와 광고를 맡을 수 있는 앱 안에서만 켠다.
 * 충전 포인트는 서버가 결제 알림을 받아 주므로 결제가 끝나면 잔액이 늘 때까지 다시 읽는다.
 * 광고 포인트도 서버가 광고 사업자의 시청 확인을 받아 주므로 광고가 끝나면 오늘 본 횟수가 늘 때까지 다시 읽는다.
 * 같은 구매가 두 번 와도 서버가 한 번만 처리하므로 따로 중복 방지 키를 보내지 않는다.
 * 상점 화면은 상품과 마스코트를 함께 쓰므로 두 조회를 묶어 한 번에 넘긴다.
 */
export function createApiPointsGateway(): PointsGateway {
  const capabilities: PointsCapabilities = {
    earn: true,
    history: true,
    charge: isNativePointsChargeAvailable(),
    ads: isNativePointsAdsAvailable(),
  };
  return {
    capabilities,
    getBalance: async () => (await getPointsBalance()).balance,
    getShop: async () => {
      const [items, mascots] = await Promise.all([getShopItems(), getMascots()]);
      return toShopData(items, mascots);
    },
    purchase: async (itemId) => {
      try {
        const res = await purchaseShopItem(Number(itemId));
        return { ok: true, balance: res.balance };
      } catch (error) {
        const reason = error instanceof ApiError ? toPurchaseFailure(error.code) : null;
        if (reason === null) {
          throw error;
        }
        return { ok: false, reason };
      }
    },
    equipAccessory: async (mascotId, slot, itemId) => {
      await putMascotAccessory(toMascotCode(mascotId), toSlotCode(slot), toServerItemId(itemId));
    },
    setTimerBackground: async (itemId) => {
      await putTimerBackground(toServerItemId(itemId));
    },
    selectMascot: async (id) => {
      await putSelectedMascot(toMascotCode(id));
    },
    markUnlocksSeen: async () => {
      await postMascotUnlocksSeen();
    },
    getSessionReward: async (startedAt) => toSessionReward(await getStudyReward(startedAt)),
    getHistory: async (filter, cursor) =>
      toHistoryPage(
        await getPointsHistory({ type: HISTORY_TYPE[filter], cursor, size: HISTORY_PAGE_SIZE }),
      ),
    getEarnToday: async () => toEarnToday(await getPointsEarn()),
    claim: async (kind) => {
      const result = toClaimResult(await postRewardClaim(REWARD_PATH[kind]));
      // 출석·하루 목표 받기는 응답 모양이 명세에 없어 잔액이 빠져 있으면 다시 읽는다.
      const balance = result.balance ?? (await getPointsBalance()).balance;
      return { ...result, balance };
    },
    watchAd: async () => {
      const before = (await getPointsEarn()).ad?.watchedToday ?? 0;
      const status = await requestNativePointsAd();
      if (status !== "rewarded") {
        return { status };
      }
      // 횟수와 잔액은 서버가 시청을 확인한 뒤에만 올린다.
      for (let attempt = 0; attempt < AD_SETTLE_TRIES; attempt += 1) {
        if (((await getPointsEarn()).ad?.watchedToday ?? 0) > before) {
          return { status: "rewarded", balance: (await getPointsBalance()).balance };
        }
        await wait(AD_SETTLE_INTERVAL_MS);
      }
      return { status: "late" };
    },
    getChargePacks: async () => {
      const { items } = await getPointProducts();
      const prices = await requestNativePointsPrices(items.map((item) => item.storeProductId));
      const priceById = new Map(prices.map((price) => [price.storeProductId, price.priceLabel]));
      return items.map((item) => ({
        productId: item.storeProductId,
        points: item.points,
        bonus: item.bonusPoints,
        priceLabel: priceById.get(item.storeProductId) ?? null,
        popular: false,
      }));
    },
    charge: async (productId, onPaid) => {
      const [{ items }, before] = await Promise.all([getPointProducts(), getPointsBalance()]);
      const product = items.find((item) => item.storeProductId === productId);
      if (product === undefined) {
        return { status: "failed" };
      }
      const status = await requestNativePointsPurchase(productId);
      if (status !== "completed") {
        return { status };
      }
      onPaid?.();
      for (let attempt = 0; attempt < CHARGE_SETTLE_TRIES; attempt += 1) {
        const { balance } = await getPointsBalance();
        if (balance > before.balance) {
          return {
            status: "completed",
            granted: product.points,
            bonus: product.bonusPoints,
            balance,
          };
        }
        await wait(CHARGE_SETTLE_INTERVAL_MS);
      }
      return { status: "late" };
    },
  };
}
