import type { ActiveSessionSnapshotRequest, StatusEventPayload } from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "@/lib/api";

import { clampSessionSeconds } from "./sessionRequestClamp";

/**
 * 진행 스냅샷 입력. 계약 값은 계산하지 않고 받기만 한다 — studySec/focusSec/events는
 * `sessionTimeline.ts`가 세션 상태 머신으로 계산해 넘긴다.
 */
export interface ActiveSnapshotInput {
  userId: number;
  startedAtMs: number;
  reportedAtMs: number;
  studySec: number;
  focusSec: number;
  events: StatusEventPayload[];
}

export function buildActiveSnapshotRequest(
  input: ActiveSnapshotInput,
): ActiveSessionSnapshotRequest {
  const { studySec, focusSec } = clampSessionSeconds({
    startedAtMs: input.startedAtMs,
    boundaryMs: input.reportedAtMs,
    studySec: input.studySec,
    focusSec: input.focusSec,
    events: input.events,
  });
  return {
    userId: input.userId,
    startedAt: new Date(input.startedAtMs).toISOString(),
    reportedAt: new Date(input.reportedAtMs).toISOString(),
    studySec,
    focusSec,
    events: input.events,
  };
}

/**
 * 요청이 응답 없이 매달리면 중단(Dangling Promise)하는 상한. 보고 주기(30초)보다 짧게 잡아, 멈춘 요청 하나가
 * 이후 주기를 통째로 막지 않게 한다 — 호출부의 in-flight 가드는 Promise가 끝나야 풀린다.
 */
const REPORT_TIMEOUT_MS = 20_000;

/**
 * 진행 스냅샷을 서버에 보고한다. 웹뷰에서도 CORS가 열려 있어 직접 PUT을 보낸다
 * (`statsApi`·`roomApi`와 같은 방식). 응답이 204라 본문을 읽지 않는다.
 * 실패는 status를 가진 ApiError로 던져 호출부가 400/404/409를 가른다.
 * 상한을 넘긴 요청은 AbortError로 끊어 호출부가 네트워크 실패처럼 다음 주기에 다시 보낸다.
 */
export async function reportActiveSession(
  input: ActiveSnapshotInput,
  timeoutMs: number = REPORT_TIMEOUT_MS,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/study-sessions/active`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildActiveSnapshotRequest(input)),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw await parseApiError(res, "스냅샷 보고 실패");
    }
  } finally {
    clearTimeout(timer);
  }
}
