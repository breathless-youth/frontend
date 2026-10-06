import type { InterviewStatusResponse } from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";

/** 완료 화면 카드·설정 행의 표시 여부와 구글폼 링크 조회 */
export async function getInterviewStatus(): Promise<InterviewStatusResponse> {
  const res = await apiFetch(`${API_BASE_URL}/api/interview/status`, {
    endpoint: "interview",
    method: "GET",
  });
  if (!res.ok) {
    throw await parseApiError(res, "인터뷰 상태 조회 실패");
  }
  return (await res.json()) as InterviewStatusResponse;
}
