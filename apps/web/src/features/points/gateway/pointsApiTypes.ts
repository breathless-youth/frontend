/**
 * 포인트 1단계 API의 응답 타입
 *
 * 백엔드가 알려 준 모양으로 만든 웹 쪽 타입이며 아직 Swagger와 필드를 대조하지 않았다.
 * 필드를 대조한 타입은 `packages/types`로 올리고 이 파일에서 삭제한다.
 * 충전 상품과 받기 탭 응답은 대조를 마쳐 `packages/types`의 `points.ts`에 둔다.
 * 낀 소품과 효과 조각은 다른 사람의 모습과 같은 타입이라 `packages/types`의 `mascotAppearance.ts`를 쓴다.
 * 열거 값은 서버가 값을 더해도 컴파일이 깨지지 않게 string으로 받고, 아는 값만 fromApi가 화면 값으로 바꾼다.
 */

import type {
  EffectPieceResponse,
  EquippedItemResponse,
  MascotAppearance,
} from "@focusmakers/types";

export type PointsBalanceResponse = {
  /** 무료와 결제 몫의 합이며 이미 쓴 충전 포인트가 환불되면 음수일 수 있다. */
  balance: number;
  /** 그 가운데 결제로 산 몫이며 잔액이 음수면 0이다. 이 필드가 생기기 전의 서버는 주지 않는다. */
  paidBalance?: number;
};

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
  /** 뒤 조각, 등급, 스토어 상품 ID는 이 필드들이 생기기 전의 서버가 주지 않는다. */
  backImageUrl?: string | null;
  grade?: number;
  price: number | null;
  owned: boolean;
  inUse: boolean;
  unlock: { type: string; requiredValue: number; currentValue: number } | null;
  /** 스토어 결제로 사는 상품이면 스토어 상품 ID이고 이때 price와 unlock은 null이다. */
  storeProductId?: string | null;
  /** 아래 세 필드는 세트와 효과가 생기기 전의 서버가 주지 않는다. */
  effectImageUrl?: string | null;
  effectPieces?: EffectPieceResponse[] | null;
  /** 그림 없이 코드로 그리는 빛 효과의 종류이며 이때 imageUrl은 null이다. */
  effectType?: string | null;
};

export type ShopItemsResponse = { items: ShopItemResponse[] };

export type PurchaseResponse = { itemId: number; balance: number };

export type MascotPurchaseResponse = { code: string; balance: number };

export type DecorationsResponse = {
  selectedMascotCode: string | null;
  /** 그룹 구성원에 실려 오는 모습과 같은 모양이며 마스코트마다 낀 소품이 모두 온다. */
  accessories: MascotAppearance["accessories"];
  timerBackground: EquippedItemResponse | null;
};

export type MascotResponse = {
  code: string;
  /** FOCUS_TIME(누적 순공)이나 POINTS(포인트로 사기)이며 포인트 구매가 생기기 전의 서버는 주지 않는다. */
  unlockType?: string;
  unlockFocusSec: number;
  /** unlockType이 FOCUS_TIME이면 null이다. */
  price?: number | null;
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
  /** 결제로 산 포인트가 한 포인트라도 오갔으면 PAID, 아니면 FREE다. */
  fund: string;
  /** 금액 가운데 결제로 산 몫이며 부호는 amount와 같다. 이 필드가 생기기 전의 서버는 주지 않는다. */
  paidAmount?: number;
  /** 구매는 상품 이름, 마스코트 구매는 마스코트 코드, 메달은 `FOCUS_TIME:DAILY/1`처럼 판 키와 순위, 충전과 환불은 스토어 상품 ID이고 나머지 사유는 null이다. */
  label: string | null;
  statDate: string;
  createdAt: string;
};

export type PointsHistoryResponse = {
  items: PointsHistoryItemResponse[];
  /** 다음 쪽을 부를 때 넘기는 기록 ID이며 더 없으면 null이다. */
  nextCursor: number | null;
};

/**
 * 받기 응답
 *
 * 출석·하루 목표·시작 미션은 granted, points, balance를 주고 메달 한 번에 받기는 claimedCount를 함께 준다.
 */
export type ClaimResponse = {
  granted?: boolean;
  claimedCount?: number;
  points?: number;
  balance?: number;
};
