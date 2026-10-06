import type { NoticeResponse } from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";

/**
 * 활성 공지 조회
 *
 * 서버가 사용자 그룹을 판정해 받을 공지만 내려준다.
 */
export async function getActiveNotices(): Promise<NoticeResponse[]> {
  const res = await apiFetch(`${API_BASE_URL}/api/notices/active`, {
    endpoint: "notices",
    method: "GET",
  });
  if (!res.ok) {
    throw await parseApiError(res, "공지 조회 실패");
  }
  return (await res.json()) as NoticeResponse[];
}
