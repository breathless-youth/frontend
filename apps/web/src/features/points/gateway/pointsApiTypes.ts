/**
 * 포인트 1단계 API의 응답 타입
 *
 * Swagger 등재 전에 백엔드가 알려 준 모양을 옮긴 잠정 타입이다.
 * Swagger에 올라오면 필드를 대조한 뒤 packages/types로 옮기고 이 파일은 지운다.
 * 열거 값은 서버가 값을 더해도 컴파일이 깨지지 않게 string으로 받고, 아는 값만 fromApi가 화면 값으로 바꾼다.
 */

export type PointsBalanceResponse = { balance: number };

export type StudyRewardResponse = {
  earnedPoints: number;
  statDate: string;
  recognizedFocusSec: number;
  dailyCapFocusSec: number;
  nextMascot: { code: string; unlockFocusSec: number; remainingFocusSec: number } | null;
};

export type ShopItemResponse = {
  id: number;
  code: string;
  category: string;
  mascotCode: string | null;
  slot: string | null;
  tag: string | null;
  name: string;
  imageUrl: string | null;
  price: number | null;
  owned: boolean;
  inUse: boolean;
  unlock: { type: string; requiredValue: number; currentValue: number } | null;
};

export type ShopItemsResponse = { items: ShopItemResponse[] };

export type PurchaseResponse = { itemId: number; balance: number };

export type DecorationsResponse = {
  selectedMascotCode: string | null;
  accessories: {
    mascotCode: string;
    slot: string;
    item: { itemId: number; code: string; imageUrl: string | null };
  }[];
  timerBackground: { itemId: number; code: string; imageUrl: string | null } | null;
};

export type MascotResponse = {
  code: string;
  unlockFocusSec: number;
  unlocked: boolean;
  remainingFocusSec: number;
  selected: boolean;
  newlyUnlocked: boolean;
};

export type MascotsResponse = {
  totalFocusSec: number;
  selectedMascotCode: string | null;
  mascots: MascotResponse[];
};

export type PointsHistoryItemResponse = {
  id: number;
  amount: number;
  reason: string;
  fund: string;
  /** 구매는 상품 이름, 메달은 `FOCUS_TIME:DAILY/1`처럼 판 키와 순위이고 나머지 사유는 null이다. */
  label: string | null;
  statDate: string;
  createdAt: string;
};

export type PointsHistoryResponse = {
  items: PointsHistoryItemResponse[];
  nextCursor: string | null;
};

export type PointsEarnResponse = {
  date: string;
  todayEarned: number;
  dailyMax: number;
  study: {
    recognizedFocusSec: number;
    dailyCapFocusSec: number;
    unitSec: number;
    pointsPerUnit: number;
    earnedPoints: number;
    maxPoints: number;
  };
  attendance: { points: number; claimed: boolean };
  /** 목표가 없으면 goalSec와 remainingSec이 null이고 points는 0이다. */
  dailyGoal: {
    points: number;
    goalSec: number | null;
    focusSec: number;
    remainingSec: number | null;
    achieved: boolean;
    claimed: boolean;
  };
  medals: {
    recordId: number;
    boardKey: string;
    period: string;
    periodStart: string;
    rank: number;
    points: number;
  }[];
  /** 1·2·3위 순서다. */
  medalPoints: { daily: number[]; weekly: number[]; monthly: number[] };
};

/**
 * 받기 응답
 *
 * 메달 한 번에 받기만 명세가 있고, 출석·하루 목표는 같은 모양이라고 가정해 값이 없으면 경계가 잔액을 다시 읽는다.
 */
export type ClaimResponse = {
  granted?: boolean;
  claimedCount?: number;
  points?: number;
  balance?: number;
};

/** 그룹 구성원 응답에 더해 오는 마스코트와 착용 소품 */
export type GroupMemberMascotResponse = {
  mascotCode: string;
  accessories: {
    mascotCode: string;
    slot: string;
    item: { itemId: number; code: string; imageUrl: string | null };
  }[];
};
