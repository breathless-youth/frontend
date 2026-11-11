import { ApiError } from "@/lib/api";
import {
  getMascots,
  getPointsBalance,
  getPointsHistory,
  getShopItems,
  getStudyReward,
  postMascotUnlocksSeen,
  purchaseShopItem,
  putMascotAccessory,
  putSelectedMascot,
  putTimerBackground,
} from "@/lib/pointsApi";

import {
  toMascotCode,
  toHistoryPage,
  toPurchaseFailure,
  toSessionReward,
  toShopData,
  toSlotCode,
} from "./fromApi";
import type { HistoryFilter } from "../types";
import type { PointsCapabilities, PointsGateway } from "./PointsGateway";

const STAGE_ONE_CAPABILITIES: PointsCapabilities = {
  earn: false,
  history: true,
  charge: false,
  ads: false,
};

const HISTORY_TYPE = { all: "ALL", earned: "EARNED", spent: "SPENT" } as const satisfies Record<
  HistoryFilter,
  string
>;

const HISTORY_PAGE_SIZE = 30;

function unsupported(name: string): Promise<never> {
  return Promise.reject(new Error(`points ${name} is not available yet`));
}

/** 화면의 상품 id는 서버 숫자 id를 문자열로 바꾼 것이라 보낼 때 되돌린다. */
function toServerItemId(itemId: string | null): number | null {
  return itemId === null ? null : Number(itemId);
}

/**
 * 포인트 1단계 API로 도는 경계
 *
 * 1단계에는 받기·충전·광고 API가 없어 그 기능은 capabilities에서 끄고 메서드는 거절한다.
 * 같은 구매가 두 번 와도 서버가 한 번만 처리하므로 따로 중복 방지 키를 보내지 않는다.
 * 상점 화면은 상품과 마스코트를 함께 쓰므로 두 조회를 묶어 한 번에 넘긴다.
 */
export function createApiPointsGateway(): PointsGateway {
  return {
    capabilities: STAGE_ONE_CAPABILITIES,
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
    getEarnToday: () => unsupported("earn"),
    claim: () => unsupported("claim"),
    watchAd: () => unsupported("ads"),
    getChargePacks: () => unsupported("charge packs"),
    charge: () => unsupported("charge"),
  };
}
