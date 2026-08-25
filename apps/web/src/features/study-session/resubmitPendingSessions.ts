import { ApiError } from "@/lib/api";
import { reportHandled } from "@/lib/sentry";

import { deleteCheckpoint, listCheckpoints } from "./sessionCheckpoint";
import { submitStudySession } from "./submitStudySession";

export const RESUBMIT_TOAST_MESSAGE = "저장하지 못했던 공부 기록을 저장했어요";

/**
 * 마지막 저장이 이보다 최근인 레코드는 이번 실행에서 건너뛴다. 앱은 탭·세션 화면마다
 * 별도 웹뷰로 App을 새로 마운트하는데, 같은 웹뷰에서 막 시작한 세션의 체크포인트를
 * 러너가 먼저 제출하면 0분짜리가 서버에 반영되고(멱등이 갱신을 막음) 진짜 제출이 무시된다.
 * 진짜 비정상 종료 레코드는 앱을 다시 켜는 데 이보다 오래 걸려 걸러지지 않는다.
 * 값은 체크포인트 저장 주기 10초에 여유 5초를 더한 것이다 — 진행 중 세션의 마지막 저장은
 * 항상 최근 10초 안에 있으므로, 저장 주기를 바꾸면 이 값도 함께 조정한다.
 */
const FRESH_RECORD_MS = 15_000;

/**
 * 비정상 종료 세션의 제출 재시도. 웹뷰가 App을 마운트할 때마다 실행되며(탭·세션 화면은 각각
 * 별도 웹뷰다) 서버가 (userId, startedAt) 멱등이라 반복 실행이 안전하다. 제출에 성공한
 * 건수를 돌려준다.
 * 400은 데이터 자체가 거부된 것이라 보관해도 영원히 실패한다 — 지우고 기록만 남긴다.
 * 그 외 실패(네트워크·5xx 등)는 다음 실행에서 다시 시도한다.
 */
export async function resubmitPendingSessions(): Promise<number> {
  let submitted = 0;
  for (const record of listCheckpoints()) {
    if (Date.now() - record.lastSeenMs < FRESH_RECORD_MS) {
      continue;
    }
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
