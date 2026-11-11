import type {
  AdResult,
  ChargePack,
  ChargeResult,
  ClaimKind,
  EarnToday,
  HistoryFilter,
  MascotId,
  PointsHistoryEntry,
  PurchaseResult,
  SessionReward,
  ShopData,
} from "../types";

/**
 * 포인트 화면이 필요로 하는 동작의 경계이며 HTTP 계약이 아니다.
 *
 * 잔액과 지급 여부는 서버가 원본이라 바뀐 잔액은 늘 이 경계가 돌려준 값을 쓴다.
 * 지금은 메모리 가짜 구현만 있고, API가 나오면 이 인터페이스의 구현만 바꾼다.
 */
export interface PointsGateway {
  getBalance(): Promise<number>;
  getShop(): Promise<ShopData>;
  purchase(itemId: string): Promise<PurchaseResult>;
  setInUse(itemId: string, inUse: boolean): Promise<void>;
  selectMascot(id: MascotId): Promise<void>;
  getHistory(filter: HistoryFilter): Promise<PointsHistoryEntry[]>;
  getEarnToday(): Promise<EarnToday>;
  claim(kind: ClaimKind): Promise<{ balance: number }>;
  watchAd(): Promise<AdResult>;
  getChargePacks(): Promise<ChargePack[]>;
  charge(productId: string): Promise<ChargeResult>;
  getSessionReward(sessionIds: number[]): Promise<SessionReward | null>;
}
