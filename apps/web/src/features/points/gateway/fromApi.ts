import type {
  EffectPieceResponse,
  EquippedItemResponse,
  PointsEarnResponse,
} from "@focusmakers/types";

import type { EffectPiece, WornAccessory } from "@/components/mascot/types";

import type {
  AccessorySlot,
  EarnToday,
  ItemAcquire,
  Mascot,
  MascotId,
  MedalReward,
  PointsHistoryEntry,
  PointsHistoryPage,
  PointsReason,
  PurchaseFailure,
  SessionReward,
  ShopData,
  ShopItem,
} from "../types";
import { drawingExtras, hasDrawing } from "../model/drawing";
import { tierAt } from "../model/earnTier";
import type {
  ClaimResponse,
  DecorationsResponse,
  MascotsResponse,
  PointsHistoryItemResponse,
  PointsHistoryResponse,
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
  Object.entries({
    FACE: "face",
    HEAD: "head",
    BODY: "body",
    WINGS: "wings",
    HELD: "held",
    UNDERFOOT: "underfoot",
    EFFECT: "effect",
    SET: "set",
  } satisfies Record<string, AccessorySlot>),
);

const REWARD_CONDITION_BY_TYPE: ReadonlyMap<string, "streakDays" | "focusHours"> = new Map(
  Object.entries({ STREAK_DAYS: "streakDays", TOTAL_FOCUS_HOURS: "focusHours" } as const),
);

// 확정 전인 분류 코드라 모르는 코드는 분류 없이 두어 그 상품은 전체에서만 보인다.
const BACKGROUND_CATEGORY_BY_TAG: ReadonlyMap<string, string> = new Map(
  Object.entries({
    NATURE: "nature",
    STUDY_SPACE: "studySpace",
    NIGHT_SKY: "nightSky",
    SEASON: "season",
  }),
);

// 공부 포인트의 날짜 옮김(STUDY_ADJUST)은 서버가 기록 조회에 싣지 않아 표에 없다.
const HISTORY_REASON_BY_CODE: ReadonlyMap<string, PointsReason> = new Map(
  Object.entries({
    STUDY: "study",
    PURCHASE: "purchase",
    MASCOT_PURCHASE: "mascotPurchase",
    MISSION: "mission",
    GRANT: "grant",
    ATTENDANCE: "attendance",
    DAILY_GOAL: "dailyGoal",
    MEDAL: "medal",
    AD: "ad",
    CHARGE: "charge",
    REFUND: "refund",
  } satisfies Record<string, PointsReason>),
);

const MEDAL_PERIODS: readonly MedalReward["period"][] = ["DAILY", "WEEKLY", "MONTHLY"];

const PURCHASE_FAILURE_BY_CODE: ReadonlyMap<string, PurchaseFailure> = new Map(
  Object.entries({
    INSUFFICIENT_POINTS: "insufficient",
    ITEM_ALREADY_OWNED: "owned",
    MASCOT_LOCKED: "lockedMascot",
    ITEM_NOT_PURCHASABLE: "notPurchasable",
    SHOP_ITEM_NOT_FOUND: "notFound",
    MASCOT_ALREADY_OWNED: "owned",
    MASCOT_NOT_PURCHASABLE: "notPurchasable",
    MASCOT_NOT_FOUND: "notFound",
  } satisfies Record<string, PurchaseFailure>),
);

export function toMascotId(code: string): MascotId | null {
  return MASCOT_BY_CODE.get(code) ?? null;
}

export function toMascotCode(id: MascotId): string {
  // 위 표가 일곱 마스코트를 모두 담고 있어 비지 않는다.
  return CODE_BY_MASCOT.get(id) ?? id.toUpperCase();
}

export function toAccessorySlot(code: string): AccessorySlot | null {
  return SLOT_BY_CODE.get(code) ?? null;
}

export function toSlotCode(slot: AccessorySlot): string {
  return slot.toUpperCase();
}

/** 구매 거절 코드를 화면의 실패 사유로 바꾸며 모르는 코드는 null이라 부른 쪽이 그대로 던진다. */
/**
 * 서버가 준 마스코트와 착용 소품을 그릴 수 있는 모습으로 바꾸기
 *
 * 내 꾸미기 조회와 그룹 구성원 응답이 같은 모양이라 함께 쓴다.
 * 꾸미기 조회에는 마스코트마다 낀 소품이 함께 오므로 고른 마스코트의 소품만 남긴다.
 * 고른 마스코트가 없거나 모르는 코드면 null이고, 그릴 것이 없거나 모르는 칸의 소품은 뺀다.
 */
export function toMascotLook(
  raw: { mascotCode: string | null; accessories: DecorationsResponse["accessories"] } | null,
): { id: MascotId; accessories: (WornAccessory & { code: string })[] } | null {
  const id = raw === null || raw.mascotCode === null ? null : toMascotId(raw.mascotCode);
  if (raw === null || id === null) {
    return null;
  }
  return {
    id,
    accessories: raw.accessories.flatMap((entry) => {
      const slot = toAccessorySlot(entry.slot);
      const drawing = toDrawing(entry.item);
      return entry.mascotCode !== raw.mascotCode || slot === null || drawing === null
        ? []
        : [{ slot, code: entry.item.code, ...drawing }];
    }),
  };
}

/** 그림 판에 대한 비율이 0과 1 사이인 조각만 남기며 하나도 없으면 조각 없이 통째로 그리게 한다. */
function toEffectPieces(raw: EffectPieceResponse[] | null | undefined): EffectPiece[] | undefined {
  const ratio = (value: unknown) => typeof value === "number" && value >= 0 && value <= 1;
  const pieces = (raw ?? []).filter(
    (piece) =>
      ratio(piece.x) &&
      ratio(piece.y) &&
      ratio(piece.width) &&
      ratio(piece.height) &&
      piece.width > 0 &&
      piece.height > 0 &&
      typeof piece.motion === "string",
  );
  return pieces.length > 0 ? pieces : undefined;
}

/**
 * 낀 소품의 그림 정보
 *
 * 앞 그림도 뒤 그림도 없고 코드로 그리는 빛 효과도 아니면 그릴 것이 없어 null이다.
 */
function toDrawing(item: EquippedItemResponse): Omit<WornAccessory, "slot"> | null {
  if (!hasDrawing(item)) {
    return null;
  }
  return {
    ...(item.imageUrl === null ? null : { imageUrl: item.imageUrl }),
    ...drawingExtras({ ...item, effectPieces: toEffectPieces(item.effectPieces) }),
  };
}

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
            // 포인트로 사는 마스코트인데 가격이 빠져 있으면 살 길을 보일 수 없어 공부 시간 마스코트처럼 둔다.
            price: mascot.unlockType === "POINTS" ? (mascot.price ?? null) : null,
            unlockFocusSec: mascot.unlockFocusSec,
            unlocked: mascot.unlocked,
            selected: mascot.selected,
            newlyUnlocked: mascot.newlyUnlocked,
          },
        ];
  });
}

/** 가격이 없으면 스토어 결제 상품이거나 보상 상품이고, 어느 쪽인지 모르면 얻는 길을 보일 수 없어 버린다. */
function toAcquire(item: ShopItemResponse): ItemAcquire | null {
  if (item.price !== null) {
    return { type: "price", price: item.price };
  }
  if (item.storeProductId) {
    return { type: "store", productId: item.storeProductId };
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
    ...drawingExtras({ ...item, effectPieces: toEffectPieces(item.effectPieces) }),
    acquire,
    owned: item.owned,
    inUse: item.inUse,
  };
  if (item.category === "TIMER_BACKGROUND") {
    const category = item.tag === null ? undefined : BACKGROUND_CATEGORY_BY_TAG.get(item.tag);
    return { ...base, kind: "timerBackground", ...(category === undefined ? {} : { category }) };
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

/**
 * 메달 기록 문구에서 기간과 순위 읽기
 *
 * 서버 문구는 `FOCUS_TIME:DAILY/1`처럼 판 키와 순위이고, 판 키 안에서 기간 조각만 찾는다.
 * 형식이 다르면 null이라 화면은 사유의 기본 문구를 쓴다.
 */
export function parseMedalLabel(label: string | null): PointsHistoryEntry["medal"] | null {
  const match = label === null ? null : /^([A-Z_]+(?::[A-Z_]+)*)\/([1-3])$/.exec(label);
  if (match === null) {
    return null;
  }
  const period = MEDAL_PERIODS.find((value) => match[1].split(":").includes(value));
  return period === undefined ? null : { period, rank: Number(match[2]) as 1 | 2 | 3 };
}

/** 모르는 사유는 화면에 보일 문구가 없어 그 기록만 버린다. */
export function toHistoryEntry(item: PointsHistoryItemResponse): PointsHistoryEntry | null {
  const reason = HISTORY_REASON_BY_CODE.get(item.reason);
  if (reason === undefined) {
    return null;
  }
  const entry: PointsHistoryEntry = {
    id: String(item.id),
    atMs: Date.parse(item.createdAt),
    amount: item.amount,
    reason,
  };
  if (reason === "purchase" && item.label !== null) {
    entry.itemName = item.label;
  }
  const mascotId =
    reason === "mascotPurchase" && item.label !== null ? toMascotId(item.label) : null;
  if (mascotId !== null) {
    entry.mascotId = mascotId;
  }
  const medal = reason === "medal" ? parseMedalLabel(item.label) : null;
  if (medal !== null) {
    entry.medal = medal;
  }
  return entry;
}

export function toHistoryPage(res: PointsHistoryResponse): PointsHistoryPage {
  return {
    entries: res.items.flatMap((item) => {
      const entry = toHistoryEntry(item);
      return entry === null ? [] : [entry];
    }),
    nextCursor: res.nextCursor,
  };
}

function toMedalRates(points: number[] | undefined) {
  const at = (index: number) => points?.[index] ?? 0;
  return { gold: at(0), silver: at(1), bronze: at(2) };
}

/** 숫자가 아닌 칸이 있는 구간은 그릴 수 없어 그 구간만 버린다. */
function validTiers<T extends { fromSec: number; toSec: number }>(
  tiers: readonly T[] | undefined,
  keys: readonly (keyof T)[],
): T[] {
  return (tiers ?? []).filter((tier) =>
    [...keys, "fromSec", "toSec"].every((key) => Number.isFinite(tier[key as keyof T])),
  );
}

/**
 * 오늘 받을 수 있는 포인트
 *
 * 30분마다 받는 포인트는 오늘 순공이 속한 구간의 값이고, 하루 목표도 오늘 순공이 속한 구간의 값을 쓴다.
 * 공부 구간은 혼자 값과 같이 값이 있지만 지금 화면은 혼자 값만 그린다.
 * 구간을 주지 않는 서버에서는 첫 구간 값인 pointsPerUnit을 그대로 쓴다.
 * 하루 목표의 30분당 기준을 서버가 주지 않으면 보상과 목표 시간으로 거꾸로 계산하지 않는다.
 * 모르는 기간이나 1~3위 밖 순위의 메달은 표에 그릴 자리가 없어 그 항목만 버린다.
 */
export function toEarnToday(res: PointsEarnResponse): EarnToday {
  const studyTiers = validTiers(res.study.tiers, ["soloPoints", "togetherPoints"]);
  const goalTiers = validTiers(res.dailyGoal.tiers, ["points"]);
  const goalPointsPerUnit =
    tierAt(goalTiers, res.dailyGoal.focusSec)?.points ?? res.dailyGoal.pointsPerUnit;
  return {
    earned: res.todayEarned,
    dailyMax: res.dailyMax,
    study: {
      focusSec: res.study.recognizedFocusSec,
      capSec: res.study.dailyCapFocusSec,
      unitSec: res.study.unitSec,
      pointsPerUnit:
        tierAt(studyTiers, res.study.recognizedFocusSec)?.soloPoints ?? res.study.pointsPerUnit,
      ...(res.study.togetherFocusSec === undefined
        ? null
        : { togetherFocusSec: res.study.togetherFocusSec }),
      ...(studyTiers.length === 0 ? null : { tiers: studyTiers }),
    },
    attendance: { reward: res.attendance.points, claimed: res.attendance.claimed },
    dailyGoal: {
      goalSec: res.dailyGoal.goalSec,
      ...(res.dailyGoal.unitSec === undefined || goalPointsPerUnit === undefined
        ? null
        : { unitSec: res.dailyGoal.unitSec, pointsPerUnit: goalPointsPerUnit }),
      ...(res.dailyGoal.capSec === undefined ? null : { capSec: res.dailyGoal.capSec }),
      ...(goalTiers.length === 0 ? null : { tiers: goalTiers }),
      reward: res.dailyGoal.points,
      achieved: res.dailyGoal.achieved,
      claimed: res.dailyGoal.claimed,
      remainingSec: res.dailyGoal.remainingSec,
    },
    ...(res.ad?.available === true
      ? { ad: { reward: res.ad.points, watched: res.ad.watchedToday, limit: res.ad.dailyLimit } }
      : null),
    medals: res.medals.flatMap((medal): MedalReward[] => {
      const period = MEDAL_PERIODS.find((value) => value === medal.period);
      if (period === undefined || ![1, 2, 3].includes(medal.rank)) {
        return [];
      }
      return [{ rank: medal.rank as 1 | 2 | 3, period, reward: medal.points }];
    }),
    medalRates: {
      daily: toMedalRates(res.medalPoints.daily),
      weekly: toMedalRates(res.medalPoints.weekly),
      monthly: toMedalRates(res.medalPoints.monthly),
    },
  };
}

/** 받기 응답을 화면 결과로 바꾸며, 예전 서버가 잔액을 안 주면 비워 두어 경계가 채운다. */
export function toClaimResult(res: ClaimResponse): {
  granted: boolean;
  points: number;
  balance: number | null;
} {
  return {
    granted: res.granted ?? (res.claimedCount === undefined ? true : res.claimedCount > 0),
    points: res.points ?? 0,
    balance: res.balance ?? null,
  };
}
