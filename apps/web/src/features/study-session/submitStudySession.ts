import type {
  StatusEventPayload,
  StudySessionCreateRequest,
  StudySessionResponse,
  SubjectSegmentPayload,
} from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "@/lib/api";
import { legacyUserId } from "@/lib/userId";

import { clampSessionSeconds, clampSubjectSegments } from "./sessionRequestClamp";

/**
 * 세션 제출 입력. 이 모듈은 값을 계산하지 않고 받기만 한다 —
 * studySec/focusSec/events는 `sessionTimeline.ts`(순수 로직)가 세션 상태 머신으로 계산해서 넘긴다.
 * 감지 신호는 아직 mock이라 실측 정확도는 실기기 스파이크 이후에 검증한다.
 */
export interface SessionInput {
  startedAtMs: number;
  endedAtMs: number;
  studySec: number;
  focusSec: number;
  events?: StatusEventPayload[];
  /** 과목 구간 — `subjectSegments.ts`가 남긴 값. 클램프 뒤 비어 있으면 필드를 싣지 않는다. */
  subjectSegments?: SubjectSegmentPayload[];
  /** 이 세션에서 완료한 할 일 id — `completedTasks.ts`가 파생한 값. 비어 있으면 필드를 싣지 않는다. */
  completedTaskIds?: number[];
}

/**
 * 서버 검증 규칙 위반(400)을 예방하는 클램프 체인:
 * `0 ≤ focusSec ≤ studySec ≤ (endedAt − startedAt) − PAUSE 합`.
 *
 * 클램프 자체는 `clampSessionSeconds`가 소유하고 진행 스냅샷(`reportActiveSession`)과 공유한다 —
 * 계약 검증이 두 곳에서 갈리지 않게 한 곳에 둔다.
 *
 * 회귀 관측 신호: 일시정지가 있었던 세션인데 S4 헤더의 `총 공부`가 `HH:MM – HH:MM` 벽시계
 * 범위와 같게 나오면 그건 S4 버그가 아니라 이 경로가 깨졌다는 신호다.
 */
export function buildSessionRequest(input: SessionInput): StudySessionCreateRequest {
  const events = input.events ?? [];
  const { studySec, focusSec } = clampSessionSeconds({
    startedAtMs: input.startedAtMs,
    boundaryMs: input.endedAtMs,
    studySec: input.studySec,
    focusSec: input.focusSec,
    events,
  });
  const request: StudySessionCreateRequest = {
    startedAt: new Date(input.startedAtMs).toISOString(),
    endedAt: new Date(input.endedAtMs).toISOString(),
    studySec,
    focusSec,
    events,
  };
  // 선택 필드 — 없으면 구 계약과 바이트 단위로 같은 요청이다(기존 테스트가 정확히 그 모양을 본다).
  const subjectSegments = clampSubjectSegments(
    input.subjectSegments ?? [],
    input.startedAtMs,
    input.endedAtMs,
  );
  if (subjectSegments.length > 0) {
    request.subjectSegments = subjectSegments;
  }
  if (input.completedTaskIds !== undefined && input.completedTaskIds.length > 0) {
    request.completedTaskIds = input.completedTaskIds;
  }
  return request;
}

/**
 * 응답은 항상 배열 — KST 자정을 넘는 세션은 날짜별 2개로 분할되어 내려온다.
 *
 * 앱 WebView와 브라우저가 같은 경로를 탄다. dev는 Vite `/api` 프록시가 백엔드로 전달한다.
 */
export async function submitStudySession(input: SessionInput): Promise<StudySessionResponse[]> {
  const request = buildSessionRequest(input);
  const legacy = legacyUserId();
  const res = await apiFetch(`${API_BASE_URL}/api/study-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // 토큰 없는 문서(구 앱)만 사용자 번호를 싣는다. 빌더는 순수하게 두고 여기서만 합친다.
    body: JSON.stringify(legacy === null ? request : { ...request, userId: legacy }),
  });
  if (!res.ok) {
    // 상태코드가 있어야 호출부가 400 같은 영구 실패와 일시 실패를 가른다.
    throw await parseApiError(res, "세션 제출 실패");
  }
  return (await res.json()) as StudySessionResponse[];
}
