import type { PointsChargePrice, PointsChargePurchaseStatus } from "@focusmakers/types";

import { awaitAuth } from "./auth";

/**
 * 결제 SDK 어댑터
 *
 * `purchase`는 결제가 끝나면 true, 사용자가 결제 창을 닫았으면 false를 돌려주고 그 밖의 실패는 throw한다.
 */
export type PointsChargeAdapter = {
  logIn(appUserId: string): Promise<void>;
  prices(storeProductIds: string[]): Promise<PointsChargePrice[]>;
  purchase(storeProductId: string): Promise<boolean>;
};

let adapter: PointsChargeAdapter | null = null;
let inFlight = false;

export function setPointsChargeAdapter(next: PointsChargeAdapter): void {
  adapter = next;
}

/**
 * 테스트 전용 어댑터·진행 중 표시 초기화
 *
 * 프로덕션 코드에서는 호출하지 않는다.
 */
export function __resetPointsChargeForTests(): void {
  adapter = null;
  inFlight = false;
}

/** 이 바이너리가 포인트 충전 결제를 할 수 있는지 여부 */
export function isPointsChargeSupported(): boolean {
  return adapter !== null;
}

/**
 * 스토어의 충전 상품 가격 조회
 *
 * 가격과 통화는 스토어가 정하므로 서버가 아니라 결제 SDK에서 읽는다.
 * 실패하면 빈 목록을 돌려줘서 웹이 가격 없는 상품을 팔지 않게 한다.
 */
export async function pointsChargePrices(storeProductIds: string[]): Promise<PointsChargePrice[]> {
  if (adapter === null || storeProductIds.length === 0) {
    return [];
  }
  try {
    return await adapter.prices(storeProductIds);
  } catch (error) {
    console.warn("[points-charge] 가격 조회 실패", error);
    return [];
  }
}

/**
 * 포인트 충전 결제
 *
 * 서버는 결제 알림에 실린 사용자 ID로 포인트를 줄 계정을 찾으므로, 결제 전에 지금 사용자 ID로 결제 SDK에 로그인한다.
 * 로그인에 실패하면 결제하지 않는다. 주인을 모르는 결제는 돈만 나가고 포인트가 들어오지 않는다.
 * 결제 창이 떠 있는 동안 온 두 번째 요청은 취소로 답한다.
 */
export async function purchasePointsCharge(
  storeProductId: string,
): Promise<PointsChargePurchaseStatus> {
  if (adapter === null) {
    return "failed";
  }
  if (inFlight) {
    return "cancelled";
  }
  inFlight = true;
  try {
    const auth = await awaitAuth();
    if (auth === null) {
      return "failed";
    }
    await adapter.logIn(String(auth.userId));
    return (await adapter.purchase(storeProductId)) ? "completed" : "cancelled";
  } catch (error) {
    console.warn("[points-charge] 결제 실패", error);
    return "failed";
  } finally {
    inFlight = false;
  }
}
