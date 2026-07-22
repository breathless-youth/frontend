import {
  endSession as endStudySession,
  recordStatus,
  startSession,
  summarizeSession,
  type FocusTimelineEvent,
  type StudySession,
  type StudySessionSummary,
} from "@focuson/study-core";

import type { StudyMode } from "@focuson/types";

export interface PersistedSession {
  id: string;
  mode: StudyMode;
  session: StudySession;
}

/**
 * 세션 저장/복구 경계. 서버가 준비되면 여기에 실제 API 연동이 꽂힌다.
 *
 * 실구현이 지켜야 할 원칙(현재는 인터페이스로만 표시):
 * - 복귀 시 서버 세션 상태와 재동기화(`resync`) — 로컬 타이머만 신뢰해 복구하지 않는다.
 * - 세션 종료(`endSession`) 이벤트 중복 전송에 안전(멱등).
 * - 비정상 종료 시 마지막 확정 이벤트까지 복구 가능.
 * - 서버로는 상태 이벤트/집계 결과만 전송(원본 프레임·얼굴 데이터 전송 금지).
 */
export interface SessionRepository {
  createSession(input: {
    id: string;
    mode: StudyMode;
    startedAtMs: number;
  }): Promise<PersistedSession>;
  appendEvent(id: string, event: FocusTimelineEvent): Promise<void>;
  endSession(id: string, endedAtMs: number): Promise<StudySessionSummary>;
  resync(id: string): Promise<PersistedSession | null>;
}

/**
 * 서버 없는 현 단계용 in-memory mock. 경계를 채워 앱이 동작하고 타입검사가 통과하도록 한다.
 */
export function createInMemorySessionRepository(): SessionRepository {
  const store = new Map<string, PersistedSession>();

  return {
    async createSession({ id, mode, startedAtMs }) {
      const persisted: PersistedSession = {
        id,
        mode,
        session: startSession(startedAtMs),
      };
      store.set(id, persisted);
      return persisted;
    },
    async appendEvent(id, event) {
      const persisted = store.get(id);
      if (!persisted) return;
      store.set(id, { ...persisted, session: recordStatus(persisted.session, event) });
    },
    async endSession(id, endedAtMs) {
      const persisted = store.get(id);
      if (!persisted) {
        return { totalStudySeconds: 0, pureStudySeconds: 0, focusRate: 0 };
      }
      const ended = endStudySession(persisted.session, endedAtMs);
      store.set(id, { ...persisted, session: ended });
      return summarizeSession(ended);
    },
    async resync(id) {
      return store.get(id) ?? null;
    },
  };
}
