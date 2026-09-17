import type { ProfileResponse, ProfileUpdateRequest } from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";

/**
 * 프로필 조회·수정
 */

export async function getProfile(): Promise<ProfileResponse> {
  const res = await apiFetch(`${API_BASE_URL}/api/users/me/profile`, { method: "GET" });
  if (!res.ok) {
    throw await parseApiError(res, "프로필 조회 실패");
  }
  return (await res.json()) as ProfileResponse;
}

export async function updateProfile(patch: ProfileUpdateRequest): Promise<ProfileResponse> {
  const res = await apiFetch(`${API_BASE_URL}/api/users/me/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw await parseApiError(res, "프로필 저장 실패");
  }
  return (await res.json()) as ProfileResponse;
}
