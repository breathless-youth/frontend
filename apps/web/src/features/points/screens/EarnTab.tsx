import type { AdResult, ChargePack, ChargeResult, ClaimKind, EarnToday } from "../types";

/**
 * 포인트 받기 탭이며 다음 작업에서 채운다.
 *
 * 받기·광고·충전은 잔액을 고친 뒤의 결과를 돌려줘서 탭이 완료·실패 창을 고른다.
 */
export function EarnTab(_props: {
  earn: EarnToday;
  packs: ChargePack[];
  inApp: boolean;
  onClaim: (kind: ClaimKind) => Promise<{ balance: number }>;
  onWatchAd: () => Promise<AdResult>;
  onCharge: (productId: string) => Promise<ChargeResult>;
}) {
  return null;
}
