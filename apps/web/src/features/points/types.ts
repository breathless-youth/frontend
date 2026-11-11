/**
 * 포인트 화면의 타입
 *
 * 서버 계약이 아니라 화면이 쓰는 모양이다.
 * 서버 응답은 gateway/fromApi.ts가 이 모양으로 바꿔 넘긴다.
 */

export type MascotId =
  "book" | "planner" | "pencil" | "stopwatch" | "lamp" | "padlock" | "camcorder";

export type Mascot = {
  id: MascotId;
  unlockFocusSec: number;
  unlocked: boolean;
  selected: boolean;
  /** 열린 뒤 아직 축하 화면을 보지 않았는지이며 서버가 기억한다. */
  newlyUnlocked: boolean;
};

export type AccessorySlot = "head" | "face" | "body";

export type ShopItemKind = "accessory" | "timerBackground";

export type ItemAcquire =
  | { type: "price"; price: number }
  | { type: "reward"; condition: "streakDays" | "focusHours"; current: number; target: number };

export type ShopItem = {
  id: string;
  kind: ShopItemKind;
  name: string;
  imageUrl: string | null;
  acquire: ItemAcquire;
  owned: boolean;
  inUse: boolean;
  mascotId?: MascotId;
  slot?: AccessorySlot;
  category?: string;
};

export type ShopData = { items: ShopItem[]; mascots: Mascot[]; totalFocusSec: number };

export type PointsReason =
  "study" | "attendance" | "dailyGoal" | "ad" | "medal" | "charge" | "purchase";

export type PointsHistoryEntry = {
  id: string;
  atMs: number;
  amount: number;
  reason: PointsReason;
  itemName?: string;
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

export type PurchaseResult = { ok: true; balance: number } | { ok: false; reason: PurchaseFailure };

export type AdResult =
  { status: "rewarded"; balance: number } | { status: "unavailable" } | { status: "cancelled" };

export type ChargeResult =
  | { status: "completed"; granted: number; bonus: number; balance: number }
  | { status: "failed" }
  | { status: "cancelled" };

export type ClaimKind = "attendance" | "dailyGoal" | "medals";

/** 같은 보상을 다시 받으면 서버가 오류 대신 `granted: false`와 지금 잔액을 준다. */
export type ClaimResult = { granted: boolean; points: number; balance: number };

export type PointsTab = "shop" | "earn";
