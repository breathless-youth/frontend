import type {
  PointsChargePrice,
  PointsChargePurchaseStatus,
  PointsChargeRestoreStatus,
} from "@focusmakers/types";

/**
 * 결제 SDK 어댑터
 *
 * `purchase`는 결제가 끝나면 true, 사용자가 결제 창을 닫았으면 false를 돌려주고 그 밖의 실패는 throw한다.
 * `restore`는 스토어 결제 기록을 결제 SDK에 다시 맞춘 뒤 그 기록에 있는 스토어 상품 ID를 돌려준다.
 */
export type PointsChargeAdapter = {
  logIn(appUserId: string): Promise<void>;
  prices(storeProductIds: string[]): Promise<PointsChargePrice[]>;
  purchase(storeProductId: string): Promise<boolean>;
  restore(): Promise<string[]>;
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
 * 결제·복원과 같은 결제용 ID로 결제 SDK의 사용자를 맞춰 두되, 가격은 돈이 오가지 않아 로그인에 실패해도 묻는다.
 * 실패하면 빈 목록을 돌려줘서 웹이 가격 없는 상품을 팔지 않게 한다.
 */
export async function pointsChargePrices(
  storeProductIds: string[],
  appUserId: string | null,
): Promise<PointsChargePrice[]> {
  if (adapter === null || storeProductIds.length === 0) {
    return [];
  }
  if (appUserId !== null) {
    await adapter.logIn(appUserId).catch((error: unknown) => {
      console.warn("[points-charge] 가격 조회 전 로그인 실패", error);
    });
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
 * 서버는 결제 알림에 실린 결제용 ID로 포인트를 줄 계정을 찾으므로, 결제 전에 웹이 넘긴 결제용 ID로 결제 SDK에 로그인한다.
 * 결제용 ID는 서버의 충전 상품 목록이 회원에게만 주는 값이고 회원번호와 다르다.
 * 회원번호로 로그인한 결제는 서버가 지급하지 않으므로 결제용 ID가 없으면 회원번호로 대신하지 않고 결제하지 않는다.
 * 로그인에 실패해도 결제하지 않는다. 주인을 모르는 결제는 돈만 나가고 포인트가 들어오지 않는다.
 * 결제 창이 떠 있는 동안 온 두 번째 요청은 취소로 답한다.
 */
export async function purchasePointsCharge(
  storeProductId: string,
  appUserId: string | null,
): Promise<PointsChargePurchaseStatus> {
  if (adapter === null || appUserId === null) {
    return "failed";
  }
  if (inFlight) {
    return "cancelled";
  }
  inFlight = true;
  try {
    await adapter.logIn(appUserId);
    return (await adapter.purchase(storeProductId)) ? "completed" : "cancelled";
  } catch (error) {
    console.warn("[points-charge] 결제 실패", error);
    return "failed";
  } finally {
    inFlight = false;
  }
}

/**
 * 구매 복원
 *
 * 결제로 산 상품이 새 기기나 다시 설치한 앱에서 보이지 않을 때 스토어 결제 기록으로 되찾는다.
 * 서버는 결제 알림에 실린 결제용 ID로 보유를 바꾸므로, 결제와 같은 결제용 ID로 로그인한 뒤에 복원한다.
 * 결제 기록에는 충전 묶음도 남아서, 웹이 넘긴 상품이 그 안에 있을 때만 되찾았다고 답한다.
 * 결제나 다른 복원이 진행 중이면 실패로 답한다.
 */
export async function restorePointsPurchases(
  storeProductIds: string[],
  appUserId: string | null,
): Promise<PointsChargeRestoreStatus> {
  if (adapter === null || appUserId === null || inFlight) {
    return "failed";
  }
  inFlight = true;
  try {
    await adapter.logIn(appUserId);
    const purchased = new Set(await adapter.restore());
    return storeProductIds.some((id) => purchased.has(id)) ? "restored" : "nothing";
  } catch (error) {
    console.warn("[points-charge] 구매 복원 실패", error);
    return "failed";
  } finally {
    inFlight = false;
  }
}
