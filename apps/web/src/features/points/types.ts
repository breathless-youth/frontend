/**
 * 포인트 화면의 타입
 *
 * 서버 계약이 아니라 화면이 쓰는 모양이다.
 * 서버 응답은 gateway/fromApi.ts가 이 모양으로 바꿔 넘긴다.
 */

import type { AccessorySlot, EffectPiece, MascotId } from "@/components/mascot/types";

export type { AccessorySlot, MascotId };

export type Mascot = {
  id: MascotId;
  /** 포인트로 사서 여는 마스코트의 가격이며 공부 시간으로 여는 마스코트는 null이다. */
  price: number | null;
  unlockFocusSec: number;
  unlocked: boolean;
  selected: boolean;
  /** 열린 뒤 아직 축하 화면을 보지 않았는지이며 서버가 기억한다. */
  newlyUnlocked: boolean;
};

export type ShopItemKind = "accessory" | "timerBackground";

export type ItemAcquire =
  | { type: "price"; price: number }
  /** 스토어 결제로만 사는 상품이며 가격 문구는 스토어가 알려 준다. */
  | { type: "store"; productId: string }
  | { type: "reward"; condition: "streakDays" | "focusHours"; current: number; target: number };

export type ShopItem = {
  id: string;
  kind: ShopItemKind;
  name: string;
  imageUrl: string | null;
  /** 마스코트 뒤에 그리는 조각이며 없는 상품이 대부분이다. */
  backImageUrl?: string | null;
  /** 세트에서 옷과 따로 움직이는 효과 그림 */
  effectImageUrl?: string;
  /** 효과 칸 소품은 imageUrl을, 세트는 effectImageUrl을 이 조각대로 잘라 움직인다. */
  effectPieces?: readonly EffectPiece[];
  /** 그림 없이 코드로 그리는 빛 효과의 종류이며 이때 imageUrl은 null이다. */
  effectType?: string;
  acquire: ItemAcquire;
  owned: boolean;
  inUse: boolean;
  mascotId?: MascotId;
  slot?: AccessorySlot;
  category?: string;
};

export type ShopData = { items: ShopItem[]; mascots: Mascot[]; totalFocusSec: number };

export type PointsReason =
  | "study"
  | "attendance"
  | "dailyGoal"
  | "ad"
  | "medal"
  | "charge"
  | "purchase"
  | "mascotPurchase"
  | "mission"
  | "refund";

export type PointsHistoryEntry = {
  id: string;
  atMs: number;
  amount: number;
  reason: PointsReason;
  itemName?: string;
  /** 포인트로 산 마스코트이며 모르는 마스코트면 없다. */
  mascotId?: MascotId;
  medal?: { period: MedalReward["period"]; rank: MedalReward["rank"] };
};

/** 기록 한 쪽이며 `nextCursor`가 null이면 더 받을 쪽이 없다. */
export type PointsHistoryPage = { entries: PointsHistoryEntry[]; nextCursor: string | null };

export type HistoryFilter = "all" | "earned" | "spent";

export type MedalReward = {
  rank: 1 | 2 | 3;
  period: "DAILY" | "WEEKLY" | "MONTHLY";
  reward: number;
};

export type MedalRates = { gold: number; silver: number; bronze: number };

export type EarnToday = {
  earned: number;
  dailyMax: number;
  study: { focusSec: number; capSec: number; unitSec: number; pointsPerUnit: number };
  attendance: { reward: number; claimed: boolean };
  dailyGoal: {
    /** 목표를 안 정했으면 null이다. */
    goalSec: number | null;
    /** 서버가 기준을 주지 않으면 없고, 그때 타일은 `30분당` 줄을 그리지 않는다. */
    unitSec?: number;
    pointsPerUnit?: number;
    reward: number;
    achieved: boolean;
    claimed: boolean;
    remainingSec: number | null;
  };
  /** 광고를 지원하지 않는 경계에서는 없고, 그때 광고 타일을 그리지 않는다. */
  ad?: { reward: number; watched: number; limit: number };
  medals: MedalReward[];
  medalRates: Record<"daily" | "weekly" | "monthly", MedalRates>;
};

export type ChargePack = {
  productId: string;
  points: number;
  bonus: number;
  priceLabel: string | null;
  popular: boolean;
};

export type SessionReward = {
  earned: number;
  todayFocusSec: number;
  capSec: number;
  nextMascot: { id: MascotId; remainingSec: number; progress: number } | null;
};

export type PurchaseFailure =
  "insufficient" | "owned" | "lockedMascot" | "notPurchasable" | "notFound";

/** 스토어 결제로 상품을 산 결과이며 `late`는 결제는 끝났는데 기다리는 동안 보유로 바뀌지 않은 것이다. */
export type StorePurchaseResult =
  { status: "completed" } | { status: "late" } | { status: "failed" } | { status: "cancelled" };

export type PurchaseResult = { ok: true; balance: number } | { ok: false; reason: PurchaseFailure };

export type AdResult =
  | { status: "rewarded"; balance: number }
  /** 광고는 끝까지 봤는데 기다리는 동안 서버가 시청을 확인하지 못했다. */
  | { status: "late" }
  | { status: "unavailable" }
  | { status: "cancelled" };

export type ChargeResult =
  | { status: "completed"; granted: number; bonus: number; balance: number }
  /** 스토어 결제는 끝났는데 기다리는 동안 포인트가 들어오지 않았다. */
  | { status: "late" }
  | { status: "failed" }
  | { status: "cancelled" };

/** 구매 복원 결과이며 `nothing`은 스토어 결제 기록에 되찾을 상품이 없는 것이다. */
export type RestoreResult = "restored" | "nothing" | "failed";

export type ClaimKind = "attendance" | "dailyGoal" | "medals";

/** 같은 보상을 다시 받으면 서버가 오류 대신 `granted: false`와 지금 잔액을 준다. */
export type ClaimResult = { granted: boolean; points: number; balance: number };

export type PointsTab = "shop" | "earn";
