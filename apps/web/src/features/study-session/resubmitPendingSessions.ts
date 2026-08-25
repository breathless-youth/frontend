import { ApiError } from "@/lib/api";
import { reportHandled } from "@/lib/sentry";

import { deleteCheckpoint, listCheckpoints } from "./sessionCheckpoint";
import { submitStudySession } from "./submitStudySession";

export const RESUBMIT_TOAST_MESSAGE = "저장하지 못했던 공부 기록을 저장했어요";

/**
 * 비정상 종료 세션의 재제출 — 앱 부팅 시 1회. 제출에 성공한 건수를 돌려준다.
 * 서버가 (userId, startedAt) 멱등이라 중복 저장 걱정 없이 다시 보낼 수 있다.
 * 400은 데이터 자체가 거부된 것이라 보관해도 영원히 실패한다 — 지우고 기록만 남긴다.
 * 그 외 실패(네트워크·5xx 등)는 다음 실행에서 다시 시도한다.
 */
export async function resubmitPendingSessions(): Promise<number> {
  let submitted = 0;
  for (const record of listCheckpoints()) {
    try {
      await submitStudySession({
        userId: record.userId,
        startedAtMs: record.startedAtMs,
        endedAtMs: record.lastSeenMs,
        studySec: record.studySec,
        focusSec: record.focusSec,
        events: record.events,
      });
      deleteCheckpoint(record.startedAtMs);
      submitted += 1;
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        deleteCheckpoint(record.startedAtMs);
        reportHandled(error, "session-resubmit");
      }
    }
  }
  return submitted;
}
