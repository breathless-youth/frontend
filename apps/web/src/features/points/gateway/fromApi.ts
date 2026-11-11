import type {
  AccessorySlot,
  ItemAcquire,
  Mascot,
  MascotId,
  PurchaseFailure,
  SessionReward,
  ShopData,
  ShopItem,
} from "../types";
import type {
  MascotsResponse,
  ShopItemResponse,
  ShopItemsResponse,
  StudyRewardResponse,
} from "./pointsApiTypes";

/**
 * 포인트 API 응답을 화면 타입으로 바꾸는 함수
 *
 * 웹은 서버와 따로 배포되어 서버가 마스코트나 상품 종류를 먼저 더할 수 있다.
 * 모르는 값이 든 항목은 그 항목만 버려서 나머지 화면은 그대로 그린다.
 * 서버 값을 그대로 열쇠로 쓰므로 객체 속성과 겹치지 않게 Map에 둔다.
 */

// 서버의 LOCK은 화면과 카탈로그에서 padlock이다.
const MASCOT_BY_CODE: ReadonlyMap<string, MascotId> = new Map(
  Object.entries({
    BOOK: "book",
    PLANNER: "planner",
    STOPWATCH: "stopwatch",
    LAMP: "lamp",
    PENCIL: "pencil",
    LOCK: "padlock",
    CAMCORDER: "camcorder",
  } satisfies Record<string, MascotId>),
);

const CODE_BY_MASCOT: ReadonlyMap<MascotId, string> = new Map(
  [...MASCOT_BY_CODE].map(([code, id]) => [id, code]),
);

const SLOT_BY_CODE: ReadonlyMap<string, AccessorySlot> = new Map(
  Object.entries({ HEAD: "head", FACE: "face", BODY: "body" } satisfies Record<
    string,
    AccessorySlot
  >),
);

const REWARD_CONDITION_BY_TYPE: ReadonlyMap<string, "streakDays" | "focusHours"> = new Map(
  Object.entries({ STREAK_DAYS: "streakDays", TOTAL_FOCUS_HOURS: "focusHours" } as const),
);

const PURCHASE_FAILURE_BY_CODE: ReadonlyMap<string, PurchaseFailure> = new Map(
  Object.entries({
    INSUFFICIENT_POINTS: "insufficient",
    ITEM_ALREADY_OWNED: "owned",
    MASCOT_LOCKED: "lockedMascot",
    ITEM_NOT_PURCHASABLE: "notPurchasable",
    SHOP_ITEM_NOT_FOUND: "notFound",
  } satisfies Record<string, PurchaseFailure>),
);

export function toMascotId(code: string): MascotId | null {
  return MASCOT_BY_CODE.get(code) ?? null;
}

export function toMascotCode(id: MascotId): string {
  // 위 표가 일곱 마스코트를 모두 담고 있어 비지 않는다.
  return CODE_BY_MASCOT.get(id) ?? id.toUpperCase();
}

export function toSlotCode(slot: AccessorySlot): string {
  return slot.toUpperCase();
}

/** 구매 거절 코드를 화면의 실패 사유로 바꾸며 모르는 코드는 null이라 부른 쪽이 그대로 던진다. */
export function toPurchaseFailure(code: string | undefined): PurchaseFailure | null {
  return code === undefined ? null : (PURCHASE_FAILURE_BY_CODE.get(code) ?? null);
}

export function toMascots(res: MascotsResponse): Mascot[] {
  return res.mascots.flatMap((mascot) => {
    const id = toMascotId(mascot.code);
    return id === null
      ? []
      : [
          {
            id,
            unlockFocusSec: mascot.unlockFocusSec,
            unlocked: mascot.unlocked,
            selected: mascot.selected,
            newlyUnlocked: mascot.newlyUnlocked,
          },
        ];
  });
}

/** 값이 null인 가격은 보상 상품이라 조건을 채운 정도로 바꾸고, 조건을 모르면 얻는 길을 보일 수 없어 버린다. */
function toAcquire(item: ShopItemResponse): ItemAcquire | null {
  if (item.price !== null) {
    return { type: "price", price: item.price };
  }
  const condition =
    item.unlock === null ? undefined : REWARD_CONDITION_BY_TYPE.get(item.unlock.type);
  if (item.unlock === null || condition === undefined) {
    return null;
  }
  return {
    type: "reward",
    condition,
    current: item.unlock.currentValue,
    target: item.unlock.requiredValue,
  };
}

export function toShopItem(item: ShopItemResponse): ShopItem | null {
  const acquire = toAcquire(item);
  if (acquire === null) {
    return null;
  }
  const base = {
    id: String(item.id),
    name: item.name,
    imageUrl: item.imageUrl,
    acquire,
    owned: item.owned,
    inUse: item.inUse,
  };
  if (item.category === "TIMER_BACKGROUND") {
    return {
      ...base,
      kind: "timerBackground",
      ...(item.tag === null ? {} : { category: item.tag }),
    };
  }
  if (item.category !== "MASCOT_ACCESSORY") {
    return null;
  }
  const mascotId = item.mascotCode === null ? null : toMascotId(item.mascotCode);
  const slot = item.slot === null ? undefined : SLOT_BY_CODE.get(item.slot);
  if (mascotId === null || slot === undefined) {
    return null;
  }
  return { ...base, kind: "accessory", mascotId, slot };
}

export function toShopData(items: ShopItemsResponse, mascots: MascotsResponse): ShopData {
  return {
    items: items.items.flatMap((item) => {
      const mapped = toShopItem(item);
      return mapped === null ? [] : [mapped];
    }),
    mascots: toMascots(mascots),
    totalFocusSec: mascots.totalFocusSec,
  };
}

/**
 * 공부 끝 보상
 *
 * 다음 마스코트까지 찬 정도는 해금 기준에서 남은 순공을 뺀 비율이다.
 * 모르는 다음 마스코트는 그림과 이름을 그릴 수 없어 그 줄을 빼고 받은 포인트만 보인다.
 */
export function toSessionReward(res: StudyRewardResponse): SessionReward {
  const next = res.nextMascot;
  const nextId = next === null ? null : toMascotId(next.code);
  return {
    earned: res.earnedPoints,
    todayFocusSec: res.recognizedFocusSec,
    capSec: res.dailyCapFocusSec,
    nextMascot:
      next === null || nextId === null
        ? null
        : {
            id: nextId,
            remainingSec: next.remainingFocusSec,
            progress:
              next.unlockFocusSec > 0
                ? Math.min(1, Math.max(0, 1 - next.remainingFocusSec / next.unlockFocusSec))
                : 1,
          },
  };
}
