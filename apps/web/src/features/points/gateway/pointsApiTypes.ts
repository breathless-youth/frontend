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
