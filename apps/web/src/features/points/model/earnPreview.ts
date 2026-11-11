import type { AdResult, EarnToday } from "../types";

/** 광고 보상이 서버에 생기기 전까지 타일에 보여 줄 예시 값 */
const AD_PREVIEW = { reward: 30, watched: 0, limit: 3 } as const;

/**
 * 광고 타일 미리 보기
 *
 * 광고 SDK와 서버 보상이 붙기 전에도 포인트 받기 탭에서 광고 타일의 자리와 모양을 확인하려고 둔다.
 * 서버가 광고 상태를 주면 그 값을 그대로 쓴다.
 */
export function withAdPreview(earn: EarnToday): EarnToday {
  return earn.ad === undefined ? { ...earn, ad: AD_PREVIEW } : earn;
}

/** 미리 보기에서는 광고를 틀 수 없어 볼 수 있는 광고가 없다는 안내로 끝낸다. */
export function previewWatchAd(): Promise<AdResult> {
  return Promise.resolve({ status: "unavailable" });
}
