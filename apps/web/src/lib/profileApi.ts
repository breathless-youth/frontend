import type { ProfileResponse, ProfileUpdateRequest } from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";
import { legacyUserId } from "./userId";

/**
 * 프로필 조회·수정
 */

/** 토큰 없는 문서(구 앱)는 사용자 번호가 경로에 들어가는 구 주소를 쓴다. */
function profilePath(): string {
  const legacy = legacyUserId();
  return `${API_BASE_URL}/api/users/${legacy === null ? "me" : legacy}/profile`;
}

export async function getProfile(): Promise<ProfileResponse> {
  const res = await apiFetch(profilePath(), { endpoint: "profile", method: "GET" });
  if (!res.ok) {
    throw await parseApiError(res, "프로필 조회 실패");
  }
  return (await res.json()) as ProfileResponse;
}

export async function updateProfile(patch: ProfileUpdateRequest): Promise<ProfileResponse> {
  const res = await apiFetch(profilePath(), {
    endpoint: "profile",
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw await parseApiError(res, "프로필 저장 실패");
  }
  return (await res.json()) as ProfileResponse;
}
