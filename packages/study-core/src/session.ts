import { normalizeTimeline, summarizeTimeline } from "./timeline";
import type { FocusTimelineEvent, StudySessionSummary, StudyStatus } from "./types";

/**
 * 진행 중/종료된 한 세션의 순수 표현(불변). 서버·타이머 상태와 독립적이며,
 * 실제 저장/복구는 `SessionRepository`(앱 계층)가 담당한다.
 */
export interface StudySession {
  startedAtMs: number;
  endedAtMs: number | null;
  timeline: readonly FocusTimelineEvent[];
}

export function startSession(
  startedAtMs: number,
  initialStatus: StudyStatus = "STUDYING",
): StudySession {
  return {
    startedAtMs,
    endedAtMs: null,
    timeline: [{ status: initialStatus, timestampMs: startedAtMs }],
  };
}

/**
 * 상태 변화 이벤트를 기록한다(정규화로 중복/역순 방어). 이미 종료된 세션은 변경하지 않는다.
 */
export function recordStatus(session: StudySession, event: FocusTimelineEvent): StudySession {
  if (session.endedAtMs !== null) {
    return session;
  }
  return {
    ...session,
    timeline: normalizeTimeline([...session.timeline, event]),
  };
}

/**
 * 세션을 종료한다. 멱등: 이미 종료된 세션에 다시 호출해도 최초 종료 시각을 유지한다
 * (세션 종료 이벤트 중복 전송 안전).
 */
export function endSession(session: StudySession, endedAtMs: number): StudySession {
  if (session.endedAtMs !== null) {
    return session;
  }
  return { ...session, endedAtMs };
}

/**
 * 세션 요약을 계산한다. 종료된 세션은 종료 시각까지, 진행 중이면 nowMs까지 집계한다.
 */
export function summarizeSession(session: StudySession, nowMs?: number): StudySessionSummary {
  const boundaryMs = session.endedAtMs ?? nowMs ?? session.startedAtMs;
  return summarizeTimeline(session.timeline, boundaryMs);
}
