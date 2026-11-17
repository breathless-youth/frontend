import type { PointsAdStatus } from "@focusmakers/types";

import { awaitAuth } from "./auth";
import { errorSummary } from "./errorSummary";

/**
 * 광고 SDK 어댑터
 *
 * `show`는 광고를 불러와 띄우고 닫힐 때까지 기다린 뒤 결과를 돌려준다.
 * `userId`는 광고 사업자가 서버에 보내는 시청 확인에 그대로 실린다.
 */
export type PointsAdsAdapter = {
  show(userId: string): Promise<PointsAdStatus>;
};

let adapter: PointsAdsAdapter | null = null;
let inFlight = false;

export function setPointsAdsAdapter(next: PointsAdsAdapter): void {
  adapter = next;
}

/**
 * 테스트 전용 어댑터·진행 중 표시 초기화
 *
 * 프로덕션 코드에서는 호출하지 않는다.
 */
export function __resetPointsAdsForTests(): void {
  adapter = null;
  inFlight = false;
}

/** 이 바이너리가 보상형 광고를 띄울 수 있는지 여부 */
export function isPointsAdsSupported(): boolean {
  return adapter !== null;
}

/**
 * 보상형 광고 보기
 *
 * 서버는 시청 확인에 실린 사용자 ID로 포인트를 줄 계정을 찾으므로, 사용자 ID를 모르면 광고를 띄우지 않는다.
 * 주인을 모르는 시청은 광고만 보고 포인트가 들어오지 않는다.
 * 광고가 떠 있는 동안 온 두 번째 요청은 취소로 답한다.
 */
export async function showPointsAd(): Promise<PointsAdStatus> {
  if (adapter === null) {
    return "unavailable";
  }
  if (inFlight) {
    return "cancelled";
  }
  inFlight = true;
  try {
    const auth = await awaitAuth();
    if (auth === null) {
      return "unavailable";
    }
    return await adapter.show(String(auth.userId));
  } catch (error) {
    console.warn("[points-ads] 광고 실패", errorSummary(error));
    return "unavailable";
  } finally {
    inFlight = false;
  }
}
