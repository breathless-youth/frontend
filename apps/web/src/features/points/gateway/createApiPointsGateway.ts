import { ApiError } from "@/lib/api";
import {
  getDecorations,
  getMascots,
  getPointProducts,
  getPointsEarn,
  getPointsBalance,
  getPointsHistory,
  getShopItems,
  getStudyReward,
  postMascotPurchase,
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
  isNativePointsRestoreAvailable,
  requestNativePointsPrices,
  requestNativePointsPurchase,
  requestNativePointsRestore,
} from "@/lib/nativePointsCharge";

import {
  toMascotCode,
  toMascotLook,
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
import type { PointProductsResponse } from "@focusmakers/types";

/** 결제 알림이 서버에 닿기까지 보통 몇 초, 길면 1분쯤 걸려서 그동안 잔액을 다시 읽는다. */
const CHARGE_SETTLE_INTERVAL_MS = 2_000;
const CHARGE_SETTLE_TRIES = 30;
/** 광고 시청 확인은 광고 사업자가 서버로 직접 보내서 몇 초 늦을 수 있다. */
const AD_SETTLE_INTERVAL_MS = 2_000;
const AD_SETTLE_TRIES = 10;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * 서버 값이 바뀔 때까지 다시 읽기
 *
 * `read`가 null이 아닌 값을 주면 그 값으로 끝내고, 정한 횟수만큼 읽어도 null이면 null이다.
 * 읽을 때마다 정한 간격을 기다린다.
 */
async function pollUntil<T>(
  read: () => Promise<T | null>,
  tries: number,
  intervalMs: number,
): Promise<T | null> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const settled = await read();
    if (settled !== null) {
      return settled;
    }
    await wait(intervalMs);
  }
  return null;
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

/**
 * 결제와 복원 전에 결제 SDK에 로그인할 결제용 ID
 *
 * 서버는 이 값으로 로그인한 결제만 지급하므로 회원번호로 대신하지 않는다.
 * 비회원이면 서버가 null을 주고, 이때는 회원 전용 거절과 같은 오류를 throw해 부른 쪽이 로그인 화면으로 보내게 한다.
 * 값이 빠졌거나 목록을 받지 못하면 일반 오류를 throw해 결제를 열지 않고 다시 시도하게 한다.
 */
function requireAppUserId(products: PointProductsResponse): string {
  const appUserId = products.revenueCatAppUserId;
  if (appUserId === null) {
    throw new ApiError("revenueCat app user id is null", 403, "MEMBER_ONLY");
  }
  if (!appUserId) {
    throw new Error("revenueCat app user id missing");
  }
  return appUserId;
}

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
    storeItems: isNativePointsChargeAvailable(),
    restore: isNativePointsRestoreAvailable(),
  };
  const rejected = (error: unknown) => {
    const reason = error instanceof ApiError ? toPurchaseFailure(error.code) : null;
    if (reason === null) {
      throw error;
    }
    return { ok: false as const, reason };
  };
  return {
    capabilities,
    getBalance: async () => (await getPointsBalance()).balance,
    getShop: async () => {
      const [items, mascots] = await Promise.all([getShopItems(), getMascots()]);
      return toShopData(items, mascots);
    },
    getMyLook: async () => {
      const res = await getDecorations();
      return toMascotLook({ mascotCode: res.selectedMascotCode, accessories: res.accessories });
    },
    purchase: async (itemId) => {
      try {
        const res = await purchaseShopItem(Number(itemId));
        return { ok: true, balance: res.balance };
      } catch (error) {
        return rejected(error);
      }
    },
    purchaseMascot: async (id) => {
      try {
        const res = await postMascotPurchase(toMascotCode(id));
        return { ok: true, balance: res.balance };
      } catch (error) {
        return rejected(error);
      }
    },
    getStorePrices: async (productIds) => {
      if (productIds.length === 0) {
        return {};
      }
      // 앱은 결제용 ID로 결제 SDK를 켜므로 비회원이거나 결제용 ID를 받지 못하면 앱에 묻지 않는다.
      const appUserId = await getPointProducts().then(
        (products) => products.revenueCatAppUserId ?? null,
        () => null,
      );
      if (appUserId === null) {
        return {};
      }
      const prices = await requestNativePointsPrices(productIds, appUserId);
      return Object.fromEntries(prices.map((price) => [price.storeProductId, price.priceLabel]));
    },
    purchaseStoreItem: async (itemId, onPaid) => {
      const owned = async () =>
        (await getShopItems()).items.find((item) => String(item.id) === itemId);
      const item = await owned();
      if (item === undefined || !item.storeProductId || item.owned) {
        return { status: "failed" };
      }
      const appUserId = requireAppUserId(await getPointProducts());
      const status = await requestNativePointsPurchase(item.storeProductId, appUserId);
      if (status !== "completed") {
        return { status };
      }
      onPaid?.();
      // 상품은 서버가 결제 알림을 받은 뒤에 보유로 바뀐다.
      const settled = await pollUntil(
        async () => ((await owned())?.owned === true ? true : null),
        CHARGE_SETTLE_TRIES,
        CHARGE_SETTLE_INTERVAL_MS,
      );
      return settled === null ? { status: "late" } : { status: "completed" };
    },
    restorePurchases: async () => {
      // 충전 묶음은 써서 없어지는 상품이라 되찾을 것은 스토어 결제로 파는 상점 상품뿐이다.
      const storeProductIds = [
        ...new Set(
          (await getShopItems()).items.flatMap((item) =>
            item.storeProductId ? [item.storeProductId] : [],
          ),
        ),
      ];
      if (storeProductIds.length === 0) {
        return "nothing";
      }
      return requestNativePointsRestore(
        storeProductIds,
        requireAppUserId(await getPointProducts()),
      );
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
      const balance = await pollUntil(
        async () =>
          ((await getPointsEarn()).ad?.watchedToday ?? 0) > before
            ? (await getPointsBalance()).balance
            : null,
        AD_SETTLE_TRIES,
        AD_SETTLE_INTERVAL_MS,
      );
      return balance === null ? { status: "late" } : { status: "rewarded", balance };
    },
    getChargePacks: async () => {
      const { items, revenueCatAppUserId } = await getPointProducts();
      // 비회원에게는 가격을 묻지 않아 앱이 결제 SDK를 켜지 않고, 화면은 가격 자리에 로그인 안내를 그린다.
      const prices = revenueCatAppUserId
        ? await requestNativePointsPrices(
            items.map((item) => item.storeProductId),
            revenueCatAppUserId,
          )
        : [];
      const priceById = new Map(prices.map((price) => [price.storeProductId, price.priceLabel]));
      return items.map((item) => ({
        productId: item.storeProductId,
        points: item.points,
        bonus: item.bonusPoints,
        priceLabel: priceById.get(item.storeProductId) ?? null,
      }));
    },
    charge: async (productId, onPaid) => {
      const [products, before] = await Promise.all([getPointProducts(), getPointsBalance()]);
      const product = products.items.find((item) => item.storeProductId === productId);
      if (product === undefined) {
        return { status: "failed" };
      }
      const status = await requestNativePointsPurchase(productId, requireAppUserId(products));
      if (status !== "completed") {
        return { status };
      }
      onPaid?.();
      const balance = await pollUntil(
        async () => {
          const { balance: current } = await getPointsBalance();
          return current > before.balance ? current : null;
        },
        CHARGE_SETTLE_TRIES,
        CHARGE_SETTLE_INTERVAL_MS,
      );
      return balance === null
        ? { status: "late" }
        : { status: "completed", granted: product.points, bonus: product.bonusPoints, balance };
    },
  };
}
