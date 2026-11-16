import { apiVersionFor } from "@focusmakers/types";
import type { ReviewLoginStatusResponse } from "@focusmakers/types";

import { API_BASE_URL, parseApiError } from "./api";

/**
 * 이 앱 버전에 심사용 로그인 입구를 그릴지 묻기
 *
 * 서버가 토큰 없이 받는 조회라 `apiFetch`를 거치지 않아 Authorization을 붙이지 않는다.
 */
export async function getReviewLoginStatus(appVersion: string): Promise<ReviewLoginStatusResponse> {
  const query = new URLSearchParams({ appVersion });
  const res = await fetch(`${API_BASE_URL}/api/auth/review-login/status?${query.toString()}`, {
    headers: { "API-Version": apiVersionFor("reviewLogin", false) },
  });
  if (!res.ok) {
    throw await parseApiError(res, "review login status fetch failed");
  }
  const body = (await res.json()) as Partial<ReviewLoginStatusResponse>;
  return { enabled: body.enabled === true };
}
