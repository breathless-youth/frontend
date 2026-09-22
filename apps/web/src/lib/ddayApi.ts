import type { DdayRequest, DdayResponse } from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";

/**
 * 홈 D-Day 조회·저장·삭제. 유저당 1개라 경로에 id가 없고 신원은 토큰이 정한다.
 * 구 앱 계약이 없는 새 경로라 구 방식 분기가 없다.
 */
const DDAY_URL = `${API_BASE_URL}/api/dday`;

/** 설정한 D-Day가 없으면 서버가 204를 준다 — 그때는 null. */
export async function getDday(): Promise<DdayResponse | null> {
  const res = await apiFetch(DDAY_URL, { endpoint: "dday", method: "GET" });
  if (res.status === 204) {
    return null;
  }
  if (!res.ok) {
    throw await parseApiError(res, "D-Day 조회 실패");
  }
  return (await res.json()) as DdayResponse;
}

/** 있으면 덮어쓰고 없으면 만든다. */
export async function putDday(body: DdayRequest): Promise<DdayResponse> {
  const res = await apiFetch(DDAY_URL, {
    endpoint: "dday",
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseApiError(res, "D-Day 저장 실패");
  }
  return (await res.json()) as DdayResponse;
}

/** 없어도 204라 두 번 눌러도 안전하다. */
export async function deleteDday(): Promise<void> {
  const res = await apiFetch(DDAY_URL, { endpoint: "dday", method: "DELETE" });
  if (!res.ok) {
    throw await parseApiError(res, "D-Day 삭제 실패");
  }
}
