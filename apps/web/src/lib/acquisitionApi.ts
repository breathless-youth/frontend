import type { AcquisitionRequest, AcquisitionResponse } from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";

/**
 * 설치 유입 경로 저장
 *
 * 서버는 사용자마다 처음 저장한 값만 남기고, 다시 보내도 처음 값을 돌려준다.
 * 실패하면 `ApiError`를 throw해서 부르는 쪽이 400과 나머지 실패를 가를 수 있게 한다.
 */
export async function postAcquisition(body: AcquisitionRequest): Promise<AcquisitionResponse> {
  const res = await apiFetch(`${API_BASE_URL}/api/users/me/acquisition`, {
    endpoint: "acquisition",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseApiError(res, "acquisition save failed");
  }
  return (await res.json()) as AcquisitionResponse;
}
