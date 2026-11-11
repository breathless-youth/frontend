import type { AdResult, ChargePack, ChargeResult, EarnToday } from "../types";

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

/**
 * 충전 칸 미리 보기에 쓰는 예시 묶음
 *
 * 인앱결제가 붙기 전에 충전 칸의 자리와 모양을 확인하려고 둔다.
 * 포인트와 가격은 정해진 값이 아니다.
 */
export const CHARGE_PACKS_PREVIEW: ChargePack[] = [
  { productId: "preview_500", points: 500, bonus: 0, priceLabel: "₩1,100", popular: false },
  { productId: "preview_1200", points: 1200, bonus: 100, priceLabel: "₩2,200", popular: true },
  { productId: "preview_3000", points: 3000, bonus: 400, priceLabel: "₩5,500", popular: false },
];

/** 미리 보기에서는 결제를 열 수 없어 결제하지 못했다는 안내로 끝낸다. */
export function previewCharge(): Promise<ChargeResult> {
  return Promise.resolve({ status: "failed" });
}
