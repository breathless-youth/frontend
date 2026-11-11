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
  SessionReward,
  ShopData,
} from "../types";

/** 경계가 지금 해낼 수 있는 일이며 화면은 false인 기능의 탭·줄·길을 그리지 않는다. */
export type PointsCapabilities = {
  earn: boolean;
  history: boolean;
  charge: boolean;
  ads: boolean;
};

export const FULL_POINTS_CAPABILITIES: PointsCapabilities = {
  earn: true,
  history: true,
  charge: true,
  ads: true,
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
  purchase(itemId: string): Promise<PurchaseResult>;
  /** itemId가 null이면 그 자리의 소품을 벗긴다. */
  equipAccessory(mascotId: MascotId, slot: AccessorySlot, itemId: string | null): Promise<void>;
  /** itemId가 null이면 기본 배경으로 돌린다. */
  setTimerBackground(itemId: string | null): Promise<void>;
  selectMascot(id: MascotId): Promise<void>;
  markUnlocksSeen(): Promise<void>;
  getSessionReward(startedAt: string): Promise<SessionReward | null>;
  /** 최신순 한 쪽이며 첫 쪽은 cursor를 null로 묻는다. */
  getHistory(filter: HistoryFilter, cursor: string | null): Promise<PointsHistoryPage>;
  getEarnToday(): Promise<EarnToday>;
  claim(kind: ClaimKind): Promise<ClaimResult>;
  watchAd(): Promise<AdResult>;
  getChargePacks(): Promise<ChargePack[]>;
  charge(productId: string): Promise<ChargeResult>;
}
