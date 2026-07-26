import type {
  StatusEventPayload,
  StudySessionCreateRequest,
  StudySessionResponse,
} from "@focuson/types";

/** 기본값은 same-origin — dev에서는 vite.config.ts의 /api 프록시가 백엔드로 전달한다(CORS 우회). 배포 시 VITE_API_BASE_URL로 지정. */
const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";

/**
 * 세션 제출 입력. 이 모듈은 값을 계산하지 않고 받기만 한다 —
 * studySec/focusSec/events는 `sessionTimeline.ts`(순수 로직)가 세션 상태 머신으로 계산해서 넘긴다.
 * 감지 신호는 아직 mock이라 실측 정확도는 실기기 스파이크 이후에 검증한다.
 */
export interface SessionInput {
  userId: number;
  startedAtMs: number;
  endedAtMs: number;
  studySec: number;
  focusSec: number;
  events?: StatusEventPayload[];
}

/** 서버 검증 규칙 위반(400)을 예방하는 클램프 체인: 0 ≤ focusSec ≤ studySec ≤ 세션 길이. */
export function buildSessionRequest(input: SessionInput): StudySessionCreateRequest {
  const sessionSec = Math.max(0, Math.floor((input.endedAtMs - input.startedAtMs) / 1000));
  const studySec = Math.min(Math.max(0, input.studySec), sessionSec);
  const focusSec = Math.min(Math.max(0, input.focusSec), studySec);
  return {
    userId: input.userId,
    startedAt: new Date(input.startedAtMs).toISOString(),
    endedAt: new Date(input.endedAtMs).toISOString(),
    studySec,
    focusSec,
    events: input.events ?? [],
  };
}

/** 응답은 항상 배열 — KST 자정을 넘는 세션은 날짜별 2개로 분할되어 내려온다. */
export async function submitStudySession(input: SessionInput): Promise<StudySessionResponse[]> {
  const res = await fetch(`${API_BASE_URL}/api/study-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildSessionRequest(input)),
  });
  if (!res.ok) {
    const message = await res
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => undefined);
    throw new Error(message ?? `세션 제출 실패 (HTTP ${res.status})`);
  }
  return (await res.json()) as StudySessionResponse[];
}
