/** 결과 설문의 대상인 공부를 같은 기기에서 복원할 수 있도록 마지막 사용 기록을 남긴다. */
export function createFocusFeatureUsage() {
  let key: string | null = null;
  let session = "";
  let used = false;

  return {
    bindSession(userId: number | null, startedAtMs: number) {
      const nextKey = userId === null ? null : `focuson.focusFeedback.usedSession.${userId}`;
      const nextSession = String(startedAtMs);
      if (key === nextKey && session === nextSession) return;

      key = nextKey;
      session = nextSession;
      used = false;
      if (key === null) return;

      try {
        used = localStorage.getItem(key) === session;
      } catch {
        // 저장소를 사용할 수 없어도 현재 공부에서는 사용 여부를 기억한다.
      }
    },
    markUsed() {
      if (used) return;
      used = true;
      if (key === null) return;

      try {
        const previousSession = Number(localStorage.getItem(key));
        if (!Number.isFinite(previousSession) || previousSession <= Number(session)) {
          localStorage.setItem(key, session);
        }
      } catch {
        // 저장 실패가 공부나 설문 표시를 막지 않는다.
      }
    },
    hasUsed: () => used,
  };
}
