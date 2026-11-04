import type { StudySessionResponse } from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";
import { legacyQuery } from "./userId";

/**
 * 공부 세션 단건 상세 조회
 */

export async function getStudySessionDetail(id: number): Promise<StudySessionResponse> {
  const res = await apiFetch(`${API_BASE_URL}/api/study-sessions/${id}${legacyQuery("")}`, {
    endpoint: "studySessionDetail",
    method: "GET",
  });
  if (!res.ok) {
    throw await parseApiError(res, "session detail fetch failed");
  }
  return (await res.json()) as StudySessionResponse;
}
