import type { PointsAdStatus } from "@focusmakers/types";

import {
  bridgeRequestId,
  isNativeBridgeAvailable,
  postToNative,
  subscribeToNativeMessages,
} from "./bridge";

// 앱 안 이동은 URL에서 쿼리를 없애므로 처음 읽은 표시를 보관한다.
function readPointsAdsFlag(): boolean {
  return new URLSearchParams(window.location.search).get("pointsAds") === "1";
}

let flagCache: boolean | null = readPointsAdsFlag();

/**
 * 앱에 보상형 광고를 맡길 수 있는지 여부
 *
 * 앱이 웹뷰 주소에 `pointsAds=1`을 붙인다(`apps/mobile/lib/remoteQueryParams.ts`).
 * 원격 웹은 구버전 앱에도 바로 배포되므로 브리지만 있고 표시가 없으면 광고 메시지를 모르는 앱으로 본다.
 */
export function isNativePointsAdsAvailable(): boolean {
  flagCache ??= readPointsAdsFlag();
  return isNativeBridgeAvailable() && flagCache;
}

/** 테스트마다 URL을 다시 읽게 하는 캐시 초기화 */
export function __resetNativePointsAdsForTests(): void {
  flagCache = null;
}

/**
 * 앱에 보상형 광고 보기 요청하기
 *
 * 광고 길이를 정할 수 없어 시간 제한 없이 기다린다.
 * `rewarded`는 광고 SDK가 보상 조건을 채웠다고 알렸다는 뜻이고 포인트는 서버가 광고 사업자의 확인을 받은 뒤에 들어온다.
 */
export function requestNativePointsAd(): Promise<PointsAdStatus> {
  const id = bridgeRequestId();
  return new Promise((resolve) => {
    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type !== "points-ad-show-result" || message.id !== id) {
        return;
      }
      unsubscribe();
      resolve(message.status);
    });
    if (!postToNative({ type: "points-ad-show", id, atMs: Date.now() })) {
      unsubscribe();
      resolve("unavailable");
    }
  });
}
