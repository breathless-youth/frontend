import type { StudySessionResponse } from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";

/**
 * 공부 세션 단건 상세 조회
 */

export async function getStudySessionDetail(
  userId: number,
  id: number,
): Promise<StudySessionResponse> {
  const res = await apiFetch(`${API_BASE_URL}/api/study-sessions/${id}?userId=${userId}`, {
    method: "GET",
  });
  if (!res.ok) {
    throw await parseApiError(res, "세션 조회 실패");
  }
  return (await res.json()) as StudySessionResponse;
}
