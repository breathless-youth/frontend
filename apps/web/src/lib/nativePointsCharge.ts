import {
  POINTS_CHARGE_PRICES_MAX_PRODUCTS,
  POINTS_CHARGE_RESTORE_MAX_PRODUCTS,
  type PointsChargePrice,
  type PointsChargePurchaseStatus,
  type PointsChargeRestoreStatus,
} from "@focusmakers/types";

import {
  bridgeRequestId,
  isNativeBridgeAvailable,
  postToNative,
  subscribeToNativeMessages,
} from "./bridge";

// 앱 안 이동은 URL에서 쿼리를 없애므로 처음 읽은 표시를 보관한다.
function readPointsChargeFlag(): boolean {
  return new URLSearchParams(window.location.search).get("pointsCharge") === "1";
}

function readPointsRestoreFlag(): boolean {
  return new URLSearchParams(window.location.search).get("pointsRestore") === "1";
}

let flagCache: boolean | null = readPointsChargeFlag();
let restoreFlagCache: boolean | null = readPointsRestoreFlag();

/**
 * 앱에 포인트 충전 결제를 맡길 수 있는지 여부
 *
 * 앱이 웹뷰 주소에 `pointsCharge=1`을 붙인다(`apps/mobile/lib/remoteQueryParams.ts`).
 * 원격 웹은 구버전 앱에도 바로 배포되므로 브리지만 있고 표시가 없으면 결제 메시지를 모르는 앱으로 본다.
 */
export function isNativePointsChargeAvailable(): boolean {
  flagCache ??= readPointsChargeFlag();
  return isNativeBridgeAvailable() && flagCache;
}

/**
 * 앱에 구매 복원을 맡길 수 있는지 여부
 *
 * 복원 메시지는 충전보다 나중에 생겨서 앱이 `pointsRestore=1`을 따로 붙인다.
 * 충전 표시만 있는 앱에 복원을 보내면 답이 오지 않는다.
 */
export function isNativePointsRestoreAvailable(): boolean {
  restoreFlagCache ??= readPointsRestoreFlag();
  return isNativeBridgeAvailable() && restoreFlagCache;
}

/** 테스트마다 URL을 다시 읽게 하는 캐시 초기화 */
export function __resetNativePointsChargeForTests(): void {
  flagCache = null;
  restoreFlagCache = null;
}

const PRICES_TIMEOUT_MS = 10_000;

/**
 * 스토어의 충전 상품 가격 묻기
 *
 * 가격과 통화는 스토어가 정해서 서버 상품 목록에는 없다.
 * 앱은 결제와 같은 결제용 ID로 결제 SDK를 켜거나 로그인한 뒤 묻는다.
 * 결제 SDK가 비회원의 기기 정보를 받지 않도록 결제용 ID가 없는 비회원은 이 메시지를 보내지 않는다.
 * 앱이 답하지 않으면 빈 목록으로 끝내서 상품 목록이 가격 없이라도 그려지게 한다.
 * 앱은 정해진 수를 넘는 상품 ID가 오면 요청을 버리고 답하지 않으므로 그 수만큼만 보낸다.
 */
export function requestNativePointsPrices(
  storeProductIds: string[],
  appUserId: string,
): Promise<PointsChargePrice[]> {
  const id = bridgeRequestId();
  return new Promise((resolve) => {
    const finish = (prices: PointsChargePrice[]) => {
      window.clearTimeout(timer);
      unsubscribe();
      resolve(prices);
    };
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type === "points-charge-prices-result" && message.id === id) {
        finish(message.prices);
      }
    });
    const timer = window.setTimeout(() => finish([]), PRICES_TIMEOUT_MS);
    const sent = postToNative({
      type: "points-charge-prices",
      id,
      storeProductIds: storeProductIds.slice(0, POINTS_CHARGE_PRICES_MAX_PRODUCTS),
      appUserId,
      atMs: Date.now(),
    });
    if (!sent) {
      finish([]);
    }
  });
}

/**
 * 앱에 포인트 충전 결제 요청하기
 *
 * 앱은 `appUserId`로 결제 SDK에 로그인한 뒤 결제하고, 서버는 그 값으로 포인트를 줄 계정을 찾는다.
 * 사용자가 결제 창에 머무는 시간을 정할 수 없어 시간 제한 없이 기다린다.
 * `completed`는 스토어 결제가 끝났다는 뜻이고 포인트는 서버가 결제 알림을 받은 뒤에 들어온다.
 */
export function requestNativePointsPurchase(
  storeProductId: string,
  appUserId: string,
): Promise<PointsChargePurchaseStatus> {
  const id = bridgeRequestId();
  return new Promise((resolve) => {
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type !== "points-charge-purchase-result" || message.id !== id) {
        return;
      }
      unsubscribe();
      resolve(message.status);
    });
    const sent = postToNative({
      type: "points-charge-purchase",
      id,
      storeProductId,
      appUserId,
      atMs: Date.now(),
    });
    if (!sent) {
      unsubscribe();
      resolve("failed");
    }
  });
}

/**
 * 앱에 구매 복원 요청하기
 *
 * 스토어가 계정 확인 창을 띄울 수 있어 결제처럼 시간 제한 없이 기다린다.
 * 앱은 결제와 같은 `appUserId`로 로그인한 뒤 복원한다.
 * 앱은 정해진 수를 넘는 상품 ID가 오면 요청을 버리고 답하지 않으므로 그 수만큼만 보낸다.
 * `restored`는 스토어 결제 기록에서 상품을 찾았다는 뜻이고 보유는 서버가 결제 알림을 받은 뒤에 바뀐다.
 */
export function requestNativePointsRestore(
  storeProductIds: string[],
  appUserId: string,
): Promise<PointsChargeRestoreStatus> {
  const id = bridgeRequestId();
  return new Promise((resolve) => {
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type !== "points-charge-restore-result" || message.id !== id) {
        return;
      }
      unsubscribe();
      resolve(message.status);
    });
    const sent = postToNative({
      type: "points-charge-restore",
      id,
      storeProductIds: storeProductIds.slice(0, POINTS_CHARGE_RESTORE_MAX_PRODUCTS),
      appUserId,
      atMs: Date.now(),
    });
    if (!sent) {
      unsubscribe();
      resolve("failed");
    }
  });
}
