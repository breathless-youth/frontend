import type { ApiEndpoint } from "@focusmakers/types";

import type {
  DecorationsResponse,
  MascotsResponse,
  PointsBalanceResponse,
  PointsHistoryResponse,
  PurchaseResponse,
  ShopItemsResponse,
  StudyRewardResponse,
} from "@/features/points/gateway/pointsApiTypes";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";
import { groupRequestLocale } from "./groupRequestLocale";

type PointsEndpoint = Extract<ApiEndpoint, "points" | "shop" | "decorations" | "mascots">;

/**
 * 포인트 API 한 번 부르기
 *
 * 실패는 서버 코드를 실은 ApiError로 던져서 경계가 구매 실패 사유나 회원 전용 거절을 코드로 가른다.
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
 * 서버는 번체를 지역과 관계없이 zh 하나로 번역해서, 그룹 번역과 같은 헬퍼로 zh-Hant를 zh-TW로 보낸다.
 * 이름이 실리지 않는 다른 포인트 API에는 보내지 않는다.
 */
function translatedHeaders(): Record<string, string> {
  return { "Accept-Language": groupRequestLocale() };
}

export type PointsHistoryType = "ALL" | "EARNED" | "SPENT";

export function getPointsHistory(params: {
  type: PointsHistoryType;
  cursor: string | null;
  size: number;
}): Promise<PointsHistoryResponse> {
  const query = new URLSearchParams({ type: params.type, size: String(params.size) });
  if (params.cursor !== null) {
    query.set("cursor", params.cursor);
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

export function postMascotUnlocksSeen(): Promise<MascotsResponse> {
  return request("/api/mascots/unlocks/seen", "mascots", "mascot unlocks seen failed", {
    method: "POST",
  });
}
