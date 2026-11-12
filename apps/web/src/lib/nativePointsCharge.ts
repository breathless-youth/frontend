import type { PointsChargePrice, PointsChargePurchaseStatus } from "@focusmakers/types";

import { isNativeBridgeAvailable, postToNative, subscribeToNativeMessages } from "./bridge";

// 앱 안 이동은 URL에서 쿼리를 없애므로 처음 읽은 표시를 보관한다.
function readPointsChargeFlag(): boolean {
  return new URLSearchParams(window.location.search).get("pointsCharge") === "1";
}

let flagCache: boolean | null = readPointsChargeFlag();

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

/** 테스트마다 URL을 다시 읽게 하는 캐시 초기화 */
export function __resetNativePointsChargeForTests(): void {
  flagCache = null;
}

// LAN 주소(http)로 연 개발 웹뷰는 비보안 문서라 randomUUID가 없다.
function requestId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Math.random());
}

const PRICES_TIMEOUT_MS = 10_000;

/**
 * 스토어의 충전 상품 가격 묻기
 *
 * 가격과 통화는 스토어가 정해서 서버 상품 목록에는 없다.
 * 앱이 답하지 않으면 빈 목록으로 끝내서 상품 목록이 가격 없이라도 그려지게 한다.
 */
export function requestNativePointsPrices(storeProductIds: string[]): Promise<PointsChargePrice[]> {
  const id = requestId();
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
    if (!postToNative({ type: "points-charge-prices", id, storeProductIds, atMs: Date.now() })) {
      finish([]);
    }
  });
}

/**
 * 앱에 포인트 충전 결제 요청하기
 *
 * 사용자가 결제 창에 머무는 시간을 정할 수 없어 시간 제한 없이 기다린다.
 * `completed`는 스토어 결제가 끝났다는 뜻이고 포인트는 서버가 결제 알림을 받은 뒤에 들어온다.
 */
export function requestNativePointsPurchase(
  storeProductId: string,
): Promise<PointsChargePurchaseStatus> {
  const id = requestId();
  return new Promise((resolve) => {
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type !== "points-charge-purchase-result" || message.id !== id) {
        return;
      }
      unsubscribe();
      resolve(message.status);
    });
    if (!postToNative({ type: "points-charge-purchase", id, storeProductId, atMs: Date.now() })) {
      unsubscribe();
      resolve("failed");
    }
  });
}
