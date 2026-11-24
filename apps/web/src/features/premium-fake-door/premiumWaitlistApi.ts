import { API_BASE_URL, apiFetch, parseApiError } from "@/lib/api";

import type { PremiumFeature, PremiumPlacement, PremiumPrice } from "./premiumFakeDoor";

/**
 * 프리미엄 사전 신청 저장
 *
 * 계약은 설계 문서 4절(BE BY-1394)이다. 백엔드 Swagger에 실리기 전이라 packages/types가 아니라 여기 둔다.
 * 사용자당 한 행 upsert라 같은 본문을 다시 보내도 된다.
 */
export interface PremiumWaitlistRequest {
  price: PremiumPrice;
  placement: PremiumPlacement;
  ageOver14: boolean;
  /** 만 14세 미만이면 null이다. */
  email: string | null;
  expectedFeature: PremiumFeature | null;
}

export async function putPremiumWaitlist(body: PremiumWaitlistRequest): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/api/premium-waitlist/me`, {
    endpoint: "premiumWaitlist",
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseApiError(res, "premium waitlist save failed");
  }
}
