import type { ApiEndpoint, PointProductsResponse, PointsEarnResponse } from "@focusmakers/types";

import type {
  DecorationsResponse,
  MascotPurchaseResponse,
  MascotsResponse,
  ClaimResponse,
  MedalClaimAllResponse,
  PointsBalanceResponse,
  PointsHistoryResponse,
  PurchaseResponse,
  ShopItemsResponse,
  StudyRewardResponse,
} from "@/features/points/gateway/pointsApiTypes";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";
import { groupRequestLocale } from "./groupRequestLocale";

type PointsEndpoint = Extract<
  ApiEndpoint,
  "points" | "pointsEarn" | "pointsRewards" | "shop" | "decorations" | "mascots"
>;

/**
 * 포인트 API 한 번 부르기
 *
 * 실패는 서버 코드를 실은 ApiError로 throw해서 경계가 구매 실패 사유나 회원 전용 거절을 코드로 구분한다.
 */
async function request<T>(
  path: string,
  endpoint: PointsEndpoint,
  fallback: string,
  init: { method: "GET" | "POST" | "PUT"; body?: unknown; headers?: Record<string, string> } = {
    method: "GET",
  },
): Promise<T> {
  const headers: Record<string, string> = { ...init.headers };
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await apiFetch(`${API_BASE_URL}${path}`, {
    endpoint,
    method: init.method,
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  if (!res.ok) {
    throw await parseApiError(res, fallback);
  }
  return (await res.json()) as T;
}

/**
 * 상품 이름과 구매 기록 문구를 화면 언어로 받는 헤더
 *
 * 서버는 번체를 지역과 관계없이 zh 하나로 받아서, 그룹 번역 언어의 zh-TW를 zh로 바꿔 보낸다.
 * 이름이 실리지 않는 다른 포인트 API에는 보내지 않는다.
 */
function translatedHeaders(): Record<string, string> {
  const language = groupRequestLocale();
  return { "Accept-Language": language === "zh-TW" ? "zh" : language };
}

export type PointsHistoryType = "ALL" | "EARNED" | "SPENT";

export function getPointsHistory(params: {
  type: PointsHistoryType;
  cursor: number | null;
  size: number;
}): Promise<PointsHistoryResponse> {
  const query = new URLSearchParams({ type: params.type, size: String(params.size) });
  if (params.cursor !== null) {
    query.set("cursor", String(params.cursor));
  }
  return request(
    `/api/points/history?${query.toString()}`,
    "points",
    "points history fetch failed",
    {
      method: "GET",
      headers: translatedHeaders(),
    },
  );
}

export function getPointsBalance(): Promise<PointsBalanceResponse> {
  return request("/api/points", "points", "points balance fetch failed");
}

export function getPointProducts(): Promise<PointProductsResponse> {
  return request("/api/points/products", "points", "point products fetch failed");
}

export function getStudyReward(startedAt: string): Promise<StudyRewardResponse> {
  return request(
    `/api/points/study-reward?startedAt=${encodeURIComponent(startedAt)}`,
    "points",
    "study reward fetch failed",
  );
}

export function getShopItems(): Promise<ShopItemsResponse> {
  return request("/api/shop/items", "shop", "shop items fetch failed", {
    method: "GET",
    headers: translatedHeaders(),
  });
}

export function purchaseShopItem(itemId: number): Promise<PurchaseResponse> {
  return request(`/api/shop/items/${itemId}/purchase`, "shop", "shop item purchase failed", {
    method: "POST",
  });
}

export function getDecorations(): Promise<DecorationsResponse> {
  return request("/api/decorations", "decorations", "decorations fetch failed", { method: "GET" });
}

export function putMascotAccessory(
  mascotCode: string,
  slot: string,
  itemId: number | null,
): Promise<DecorationsResponse> {
  return request(
    `/api/decorations/mascots/${encodeURIComponent(mascotCode)}/accessories`,
    "decorations",
    "mascot accessory update failed",
    { method: "PUT", body: { slot, itemId } },
  );
}

export function putTimerBackground(itemId: number | null): Promise<DecorationsResponse> {
  return request("/api/decorations/timer-background", "decorations", "timer background failed", {
    method: "PUT",
    body: { itemId },
  });
}

export function getMascots(): Promise<MascotsResponse> {
  return request("/api/mascots", "mascots", "mascots fetch failed");
}

export function putSelectedMascot(code: string): Promise<MascotsResponse> {
  return request("/api/mascots/selected", "mascots", "mascot select failed", {
    method: "PUT",
    body: { code },
  });
}

/** 포인트로 여는 마스코트만 살 수 있고 거절은 409의 코드로 온다. */
export function postMascotPurchase(code: string): Promise<MascotPurchaseResponse> {
  return request(
    `/api/mascots/${encodeURIComponent(code)}/purchase`,
    "mascots",
    "mascot purchase failed",
    { method: "POST" },
  );
}

export function postMascotUnlocksSeen(): Promise<MascotsResponse> {
  return request("/api/mascots/unlocks/seen", "mascots", "mascot unlocks seen failed", {
    method: "POST",
  });
}

export function getPointsEarn(): Promise<PointsEarnResponse> {
  return request("/api/points/earn", "pointsEarn", "points earn fetch failed");
}

export type RewardKind = "attendance" | "daily-goal" | "medals";

/**
 * 출석·하루 목표·메달 받기
 *
 * 이미 받은 출석과 하루 목표는 200에 granted가 false고, 받을 메달이 없으면 claimedCount가 0이다.
 * 하루 목표를 아직 못 채웠으면 서버가 409(REWARD_NOT_AVAILABLE)를 준다.
 * 서버가 포인트를 쌓기 시작한 날 전에도 출석과 하루 목표는 같은 409를 준다. 메달은 이날과 상관없이 받는다.
 */
export function postRewardClaim(kind: RewardKind): Promise<ClaimResponse | MedalClaimAllResponse> {
  return request(
    `/api/points/rewards/${kind}/claim`,
    "pointsRewards",
    "points reward claim failed",
    {
      method: "POST",
    },
  );
}
