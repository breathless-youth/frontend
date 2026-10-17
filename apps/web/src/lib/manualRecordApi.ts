import type { ManualStudySessionRequest, StudySessionResponse } from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";

/**
 * 수동 기록 추가·수정·삭제 (`/api/study-sessions/manual`)
 *
 * 토큰이 있어야 하는 새 경로라 구 방식 분기가 없다.
 * 수정·삭제는 어느 조각 id로 불러도 같은 묶음 전체에 적용된다.
 * 전부 겹치면 409이고 호출부가 `ApiError.status`로 가른다.
 */
async function send<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  const res = await apiFetch(`${API_BASE_URL}/api/study-sessions/manual${path}`, {
    ...init,
    endpoint: "studySessionManual",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw await parseApiError(res, fallback);
  }
  // 삭제는 204라 본문이 없다.
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export function createManualRecord(
  body: ManualStudySessionRequest,
): Promise<StudySessionResponse[]> {
  return send("", { method: "POST", body: JSON.stringify(body) }, "수동 기록 저장 실패");
}

export function updateManualRecord(
  id: number,
  body: ManualStudySessionRequest,
): Promise<StudySessionResponse[]> {
  return send(`/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "수동 기록 수정 실패");
}

export function deleteManualRecord(id: number): Promise<void> {
  return send(`/${id}`, { method: "DELETE" }, "수동 기록 삭제 실패");
}
