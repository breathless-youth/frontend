import type { MascotLook } from "@/components/mascot/types";

import type {
  AccessorySlot,
  AdResult,
  ChargePack,
  ChargeResult,
  ClaimKind,
  ClaimResult,
  EarnToday,
  HistoryFilter,
  MascotId,
  PointsHistoryPage,
  PurchaseResult,
  RestoreResult,
  SessionReward,
  StorePurchaseResult,
  ShopData,
} from "../types";

/** 경계가 지금 해낼 수 있는 일이며 화면은 false인 기능의 탭·줄·길을 그리지 않는다. */
export type PointsCapabilities = {
  earn: boolean;
  history: boolean;
  charge: boolean;
  ads: boolean;
  /** 스토어 결제로 사는 상품을 살 수 있는지이며 결제를 맡을 앱 안에서만 참이다. */
  storeItems: boolean;
  /** 구매 복원을 맡길 수 있는지이며 복원 메시지를 아는 앱 안에서만 참이다. */
  restore: boolean;
};

export const FULL_POINTS_CAPABILITIES: PointsCapabilities = {
  earn: true,
  history: true,
  charge: true,
  ads: true,
  storeItems: true,
  restore: true,
};

/**
 * 포인트 화면이 필요로 하는 동작의 경계이며 HTTP 계약이 아니다.
 *
 * 잔액과 지급 여부는 서버가 원본이라 바뀐 잔액은 늘 이 경계가 돌려준 값을 쓴다.
 * 실제 API 구현과 개발용 메모리 가짜 구현이 같은 모양을 지킨다.
 * capabilities가 false인 기능의 메서드는 실제 구현에서 거절되므로 화면이 부르지 않는다.
 */
export interface PointsGateway {
  readonly capabilities: PointsCapabilities;
  getBalance(): Promise<number>;
  getShop(): Promise<ShopData>;
  /** 고른 마스코트와 그 마스코트가 끼고 있는 소품이며 고른 마스코트가 없으면 null이다. */
  getMyLook(): Promise<MascotLook | null>;
  purchase(itemId: string): Promise<PurchaseResult>;
  /** 포인트로 여는 마스코트를 산다. 고르는 일은 따로 한다. */
  purchaseMascot(id: MascotId): Promise<PurchaseResult>;
  /** 스토어 결제 상품의 가격 문구이며 스토어가 답하지 않은 상품은 빠진다. */
  getStorePrices(productIds: string[]): Promise<Record<string, string>>;
  /**
   * 스토어 결제로 상품을 산다.
   *
   * onPaid는 스토어 결제가 끝나고 서버가 상품을 넣어 주기를 기다리기 시작할 때 한 번 불린다.
   * 기다려도 보유로 바뀌지 않으면 `late`로 끝난다. 돈은 이미 나갔으므로 실패와 구분한다.
   */
  purchaseStoreItem(itemId: string, onPaid?: () => void): Promise<StorePurchaseResult>;
  /**
   * 스토어 결제로 산 상품을 스토어 결제 기록으로 되찾는다.
   *
   * 보유는 서버가 결제 알림을 받은 뒤에 바뀌므로 부른 쪽이 상점을 다시 읽는다.
   */
  restorePurchases(): Promise<RestoreResult>;
  /** itemId가 null이면 그 자리의 소품을 벗긴다. */
  equipAccessory(mascotId: MascotId, slot: AccessorySlot, itemId: string | null): Promise<void>;
  /** itemId가 null이면 기본 배경으로 돌린다. */
  setTimerBackground(itemId: string | null): Promise<void>;
  selectMascot(id: MascotId): Promise<void>;
  markUnlocksSeen(): Promise<void>;
  getSessionReward(startedAt: string): Promise<SessionReward | null>;
  /** 최신순 한 쪽이며 첫 쪽은 cursor를 null로 묻는다. */
  getHistory(filter: HistoryFilter, cursor: number | null): Promise<PointsHistoryPage>;
  getEarnToday(): Promise<EarnToday>;
  claim(kind: ClaimKind): Promise<ClaimResult>;
  watchAd(): Promise<AdResult>;
  getChargePacks(): Promise<ChargePack[]>;
  /**
   * onPaid는 스토어 결제가 끝나고 서버가 포인트를 넣기를 기다리기 시작할 때 한 번 불린다.
   * 기다려도 포인트가 들어오지 않으면 `late`로 끝난다. 돈은 이미 나갔으므로 실패와 구분한다.
   */
  charge(productId: string, onPaid?: () => void): Promise<ChargeResult>;
}
