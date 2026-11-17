/**
 * 포인트 1단계 API의 응답 타입
 *
 * 2026-11-16 개발 서버 Swagger와 필드 이름, null 가능 여부, 열거 값을 대조했고 타입마다 대조한 스키마 이름을 적는다.
 * 이름은 웹이 먼저 쓰던 이름을 유지한다.
 * 이 Swagger는 필수 필드를 표시하지 않아서 null 가능 여부는 필드 설명을 따른다.
 * 새로 생긴 필드는 그 필드가 생기기 전의 서버도 받을 수 있게 선택으로 둔다.
 * 낀 소품과 효과 조각은 다른 사람의 모습과 같은 타입이라 `packages/types`의 `mascotAppearance.ts`를 쓴다.
 * 열거 값은 서버가 값을 더해도 컴파일이 깨지지 않게 string으로 받고, 아는 값만 fromApi가 화면 값으로 바꾼다.
 */

import type {
  EffectPieceResponse,
  EquippedItemResponse,
  MascotAppearance,
} from "@focusmakers/types";

/** `GET /api/points`의 `PointBalanceResponse` */
export type PointsBalanceResponse = {
  /** 무료와 결제 몫의 합이며 이미 쓴 충전 포인트가 환불되면 음수일 수 있다. */
  balance: number;
  /** 그 가운데 결제로 산 몫이며 잔액이 음수면 0이다. 이 필드가 생기기 전의 서버는 주지 않는다. */
  paidBalance?: number;
};

/** `GET /api/points/study-reward`의 `StudyRewardResponse`와 `NextMascot` */
export type StudyRewardResponse = {
  earnedPoints: number;
  statDate: string;
  recognizedFocusSec: number;
  dailyCapFocusSec: number;
  /** 다 열었으면 null이다. */
  nextMascot: { code: string; unlockFocusSec: number; remainingFocusSec: number } | null;
};

/** `GET /api/shop/items`의 `ShopItemResponse`와 `ShopItemUnlock` */
export type ShopItemResponse = {
  id: number;
  code: string;
  /** MASCOT_ACCESSORY·TIMER_BACKGROUND */
  category: string;
  /** 소품이 아니면 null이다. */
  mascotCode: string | null;
  /** HEAD·FACE·BODY·WINGS·HELD·UNDERFOOT·EFFECT·SET이며 소품이 아니면 null이다. */
  slot: string | null;
  /** 화면에서 거르는 분류 코드이며 Swagger는 열거 없이 NATURE만 예로 든다. 없으면 null이다. */
  tag: string | null;
  name: string;
  imageUrl: string | null;
  /** 뒤 조각, 등급, 스토어 상품 ID는 이 필드들이 생기기 전의 서버가 주지 않는다. */
  backImageUrl?: string | null;
  grade?: number;
  /** 포인트로 사는 상품이 아니면 null이다. */
  price: number | null;
  owned: boolean;
  inUse: boolean;
  /** type은 STREAK_DAYS·TOTAL_FOCUS_HOURS이며 보상 상품이 아니면 null이다. */
  unlock: { type: string; requiredValue: number; currentValue: number } | null;
  /** 스토어 결제로 사는 상품이면 스토어 상품 ID이고 이때 price와 unlock은 null이다. */
  storeProductId?: string | null;
  /** 아래 세 필드는 세트와 효과가 생기기 전의 서버가 주지 않는다. */
  effectImageUrl?: string | null;
  effectPieces?: EffectPieceResponse[] | null;
  /** 그림 없이 코드로 그리는 빛 효과의 종류이며 이때 imageUrl은 null이다. */
  effectType?: string | null;
};

/** `GET /api/shop/items`의 `ShopItemListResponse` */
export type ShopItemsResponse = { items: ShopItemResponse[] };

/** `POST /api/shop/items/{itemId}/purchase`의 `PurchaseResponse` */
export type PurchaseResponse = { itemId: number; balance: number };

/** `POST /api/mascots/{code}/purchase`의 `MascotPurchaseResponse` */
export type MascotPurchaseResponse = { code: string; balance: number };

/** `GET /api/decorations`와 두 `PUT` 응답의 `DecorationResponse` */
export type DecorationsResponse = {
  selectedMascotCode: string;
  /** 그룹 구성원에 실려 오는 모습과 같은 모양이며 마스코트마다 낀 소품이 모두 온다. */
  accessories: MascotAppearance["accessories"];
  /** 기본 배경이면 null이다. */
  timerBackground: EquippedItemResponse | null;
};

/** `MascotListResponse`의 마스코트 한 줄인 `MascotResponse` */
export type MascotResponse = {
  code: string;
  /** FOCUS_TIME(누적 순공)이나 POINTS(포인트로 사기)이며 포인트 구매가 생기기 전의 서버는 주지 않는다. */
  unlockType?: string;
  /** unlockType이 POINTS면 0이다. */
  unlockFocusSec: number;
  /** unlockType이 FOCUS_TIME이면 null이다. */
  price?: number | null;
  unlocked: boolean;
  remainingFocusSec: number;
  selected: boolean;
  newlyUnlocked: boolean;
};

/** `GET /api/mascots`, `PUT /api/mascots/selected`, `POST /api/mascots/unlocks/seen`의 `MascotListResponse` */
export type MascotsResponse = {
  totalFocusSec: number;
  /** 고른 적이 없으면 첫 마스코트다. */
  selectedMascotCode: string;
  mascots: MascotResponse[];
};

/** `PointHistoryResponse`의 기록 한 줄인 `PointHistoryItem` */
export type PointsHistoryItemResponse = {
  id: number;
  amount: number;
  /** STUDY·STUDY_ADJUST·PURCHASE·MASCOT_PURCHASE·MISSION·GRANT·ATTENDANCE·DAILY_GOAL·MEDAL·AD·CHARGE·REFUND */
  reason: string;
  /** 결제로 산 포인트가 한 포인트라도 오갔으면 PAID, 아니면 FREE다. */
  fund: string;
  /** 금액 가운데 결제로 산 몫이며 부호는 amount와 같다. 이 필드가 생기기 전의 서버는 주지 않는다. */
  paidAmount?: number;
  /** 구매는 상품 이름, 마스코트 구매는 마스코트 코드, 시작 미션은 `home-v3/1`처럼 미션 버전과 단계, 메달은 `FOCUS_TIME:DAILY/1`처럼 판 키와 순위, 충전과 환불은 스토어 상품 ID이고 나머지 사유는 null이다. */
  label: string | null;
  /** 공부·출석·하루 목표 기록의 날짜이며 나머지 사유는 null이다. */
  statDate: string | null;
  createdAt: string;
};

/** `GET /api/points/history`의 `PointHistoryResponse` */
export type PointsHistoryResponse = {
  items: PointsHistoryItemResponse[];
  /** 다음 쪽을 부를 때 넘기는 기록 ID이며 더 없으면 null이다. */
  nextCursor: number | null;
};

/** `POST /api/points/rewards/{attendance,daily-goal}/claim`의 `ClaimResponse`이며 이미 받았으면 granted가 false고 points가 0이다. */
export type ClaimResponse = {
  granted: boolean;
  points: number;
  balance: number;
};

/** `POST /api/points/rewards/medals/claim`의 `MedalClaimAllResponse`이며 받을 메달이 없었으면 claimedCount가 0이다. */
export type MedalClaimAllResponse = {
  claimedCount: number;
  points: number;
  balance: number;
};
