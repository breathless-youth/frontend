import type { ActiveSessionSnapshotResponse, StatusEventPayload } from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "@/lib/api";

const EVENT_STATUSES: ReadonlySet<string> = new Set(["PHONE", "DEVICE", "AWAY", "PAUSE"]);

/**
 * 이벤트 한 건이 쓸 수 있는 값인지 본다.
 *
 * 세션 훅이 마지막 일시정지를 공백과 이을 때 `startedAt`을 그대로 파싱하는데, 읽을 수 없으면
 * 타임라인 전체가 NaN이 되어 타이머와 제출이 조용히 망가진다. 끝나는 시각만 멀쩡해도 병합
 * 판정은 통과하므로 두 시각을 함께 봐야 한다.
 */
function isUsableEvent(event: StatusEventPayload): boolean {
  if (!EVENT_STATUSES.has(event.status)) {
    return false;
  }
  const startedAtMs = Date.parse(event.startedAt);
  const endedAtMs = Date.parse(event.endedAt);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) {
    return false;
  }
  return endedAtMs >= startedAtMs;
}

/**
 * 복원할 세션. 시각을 epoch ms로 바꿔 두는 이유는 세션 훅이 전부 ms로 계산하기 때문이다.
 * 서버가 준 누적값에 base라는 이름을 붙여, 지금 타임라인이 재는 값과 섞이지 않게 한다.
 */
export interface RestoredSession {
  startedAtMs: number;
  reportedAtMs: number;
  baseStudySec: number;
  baseFocusSec: number;
  events: StatusEventPayload[];
}

/** 조회가 응답 없이 매달릴 때의 상한. 룸 진입을 막고 있으므로 보고 상한보다 짧게 잡는다. */
const RESTORE_TIMEOUT_MS = 5_000;

/**
 * 진행중 세션을 조회한다. 없으면 404가 오는데 그건 오류가 아니라 정상 응답이라 null로 바꾼다.
 * 나머지 실패는 status를 가진 ApiError로 던져 호출부가 400·409와 일시 장애를 가른다.
 */
export async function restoreActiveSession(
  userId: number,
  timeoutMs: number = RESTORE_TIMEOUT_MS,
): Promise<RestoredSession | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/study-sessions/active?userId=${userId}`, {
      method: "GET",
      signal: controller.signal,
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw await parseApiError(res, "진행중 세션 조회 실패");
    }
    const body = (await res.json()) as ActiveSessionSnapshotResponse;
    const startedAtMs = Date.parse(body.startedAt);
    const reportedAtMs = Date.parse(body.reportedAt);
    // 읽을 수 없는 시각이나 뒤집힌 구간을 그대로 넘기면 타임라인이 NaN이 되어 타이머와 제출이
    // 조용히 망가진다. 복원을 포기하고 새 세션으로 시작하는 편이 낫다.
    if (!Number.isFinite(startedAtMs) || !Number.isFinite(reportedAtMs)) {
      return null;
    }
    if (reportedAtMs < startedAtMs) {
      return null;
    }
    if (!Array.isArray(body.events) || !body.events.every(isUsableEvent)) {
      return null;
    }
    return {
      startedAtMs,
      reportedAtMs,
      baseStudySec: body.studySec,
      baseFocusSec: body.focusSec,
      events: body.events,
    };
  } finally {
    clearTimeout(timer);
  }
}
