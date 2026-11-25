import type {
  ActiveSessionSnapshotRequest,
  ObservationPayload,
  StatusEventPayload,
  SubjectSegmentPayload,
} from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "@/lib/api";
import { legacyUserId } from "@/lib/userId";

import {
  clampObservations,
  clampSessionSeconds,
  clampSubjectSegments,
} from "./sessionRequestClamp";

/**
 * 진행 스냅샷 입력. 계약 값은 계산하지 않고 받기만 한다 — studySec/focusSec/events는
 * `sessionTimeline.ts`가 세션 상태 머신으로 계산해 넘긴다.
 */
export interface ActiveSnapshotInput {
  startedAtMs: number;
  reportedAtMs: number;
  studySec: number;
  focusSec: number;
  events: StatusEventPayload[];
  /** 과목 구간 — 진행 중 구간은 reportedAt에서 닫아 넘긴다. 클램프 뒤 비어 있으면 필드를 싣지 않는다(제출과 같은 규칙). */
  subjectSegments?: SubjectSegmentPayload[];
  /** 관찰 기록(하품 등). reportedAt 밖은 버리고, 비어 있으면 필드를 싣지 않는다. */
  observations?: ObservationPayload[];
  /** 제출과 같은 규칙으로 TIMER일 때만 싣는 측정 방식 */
  source?: ActiveSessionSnapshotRequest["source"];
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
  const request: ActiveSessionSnapshotRequest = {
    startedAt: new Date(input.startedAtMs).toISOString(),
    reportedAt: new Date(input.reportedAtMs).toISOString(),
    studySec,
    focusSec,
    events: input.events,
  };
  const subjectSegments = clampSubjectSegments(
    input.subjectSegments ?? [],
    input.startedAtMs,
    input.reportedAtMs,
  );
  if (subjectSegments.length > 0) {
    request.subjectSegments = subjectSegments;
  }
  const observations = clampObservations(
    input.observations ?? [],
    input.startedAtMs,
    input.reportedAtMs,
  );
  if (observations.length > 0) {
    request.observations = observations;
  }
  if (input.source === "TIMER") {
    request.source = "TIMER";
  }
  return request;
}

/**
 * 요청이 응답 없이 매달리면 중단(Dangling Promise)하는 상한. 보고 주기(30초)보다 짧게 잡아, 멈춘 요청 하나가
 * 이후 주기를 통째로 막지 않게 한다 — 호출부의 in-flight 가드는 Promise가 끝나야 풀린다.
 */
const REPORT_TIMEOUT_MS = 20_000;

/** 진행 보고 한 번의 옵션 */
export interface ReportOptions {
  /** 응답 없이 매달린 요청을 끊는 상한(ms) */
  readonly timeoutMs?: number;
  /**
   * 페이지가 닫혀도 요청을 끝까지 보낼지
   *
   * 앱을 나가는 순간의 보고에만 건다.
   * 브라우저가 keepalive 요청 본문 합계를 64KB로 제한해서 평소 보고에는 걸지 않는다.
   */
  readonly keepalive?: boolean;
}

/**
 * 진행 스냅샷을 서버에 보고한다. 웹뷰에서도 CORS가 열려 있어 직접 PUT을 보낸다
 * (`statsApi`·`roomApi`와 같은 방식). 응답이 204라 본문을 읽지 않는다.
 * 실패는 status를 가진 ApiError로 던져 호출부가 400/404/409를 가른다.
 * 상한을 넘긴 요청은 AbortError로 끊어 호출부가 네트워크 실패처럼 다음 주기에 다시 보낸다.
 */
export async function reportActiveSession(
  input: ActiveSnapshotInput,
  { timeoutMs = REPORT_TIMEOUT_MS, keepalive = false }: ReportOptions = {},
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const request = buildActiveSnapshotRequest(input);
    const legacy = legacyUserId();
    const res = await apiFetch(`${API_BASE_URL}/api/study-sessions/active?durable=true`, {
      endpoint: "activeSessionReport",
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(legacy === null ? request : { ...request, userId: legacy }),
      keepalive,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw await parseApiError(res, "session snapshot report failed");
    }
  } finally {
    clearTimeout(timer);
  }
}
