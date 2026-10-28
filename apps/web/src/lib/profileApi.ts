import type {
  ProfileImageUpdateRequest,
  ProfileImageUploadUrlRequest,
  ProfileImageUploadUrlResponse,
  ProfileResponse,
  ProfileUpdateRequest,
} from "@focusmakers/types";

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

/** 사진 경로는 구 앱 계약이 없어 문서 종류와 상관없이 `me`로 부른다. */
const PROFILE_IMAGE_PATH = `${API_BASE_URL}/api/users/me/profile-image`;

export async function requestUploadUrl(
  contentLength: number,
): Promise<ProfileImageUploadUrlResponse> {
  const body: ProfileImageUploadUrlRequest = { contentLength };
  const res = await apiFetch(`${PROFILE_IMAGE_PATH}/upload-url`, {
    endpoint: "profileImageUploadUrl",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseApiError(res, "사진 업로드 주소 발급 실패");
  }
  return (await res.json()) as ProfileImageUploadUrlResponse;
}

/**
 * S3에 사진 올리기
 *
 * `apiFetch`를 거치면 서명에 없는 `API-Version` 헤더가 붙어 S3가 요청을 거절할 수 있어 `fetch`를 그대로 쓴다.
 */
export async function uploadPhoto(uploadUrl: string, blob: Blob): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: blob,
  });
  if (!res.ok) {
    throw await parseApiError(res, "사진 업로드 실패");
  }
}

export async function registerProfileImage(key: string): Promise<ProfileResponse> {
  const body: ProfileImageUpdateRequest = { key };
  const res = await apiFetch(PROFILE_IMAGE_PATH, {
    endpoint: "profileImage",
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseApiError(res, "프로필 사진 등록 실패");
  }
  return (await res.json()) as ProfileResponse;
}

export async function deleteProfileImage(): Promise<ProfileResponse> {
  const res = await apiFetch(PROFILE_IMAGE_PATH, { endpoint: "profileImage", method: "DELETE" });
  if (!res.ok) {
    throw await parseApiError(res, "프로필 사진 삭제 실패");
  }
  return (await res.json()) as ProfileResponse;
}
