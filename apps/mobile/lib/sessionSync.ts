import { buildSubmitPayload, closeOutCheckpoint } from "@focuson/study-core";

import {
  enqueuePendingSession,
  listPendingSessions,
  removePendingSession,
} from "./pendingSessionQueue";
import { clearCheckpoint, readCheckpoint } from "./sessionCheckpointStore";
import type { SessionFileStore } from "./sessionFileStore";
import { StudySessionSubmitError, submitStudySession } from "./studySessionApi";
import { ensureUserRegistered } from "./userApi";

// 마운트+AppState active가 연달아 발동해도 동시 sync 1회로 제한한다(중복 POST·경고 로그 방지).
let syncing = false;

/**
 * 앱 기동 시 미마감 체크포인트를 소급 마감한다(스펙 6절).
 * restore 갈래(일시정지 자동종료 유예 안 지남)는 체크포인트를 그대로 두고 다음 기동에 재판정한다.
 */
export async function completePendingCheckpoint(
  nowMs: number,
  store?: SessionFileStore,
): Promise<"none" | "restorable" | "enqueued"> {
  const checkpoint = await readCheckpoint(store);
  if (checkpoint === null) {
    return "none";
  }

  const result = closeOutCheckpoint(checkpoint, nowMs);
  if (result.kind === "restore") {
    return "restorable";
  }

  const payload = buildSubmitPayload(checkpoint, result);
  await enqueuePendingSession({ sessionId: checkpoint.sessionId, payload }, store);
  await clearCheckpoint(store);
  return "enqueued";
}

/**
 * 큐에 쌓인 미제출 세션을 순서대로 재전송한다.
 * 4xx는 서버가 영구 거부한 것으로 보고 큐에서 제거·warn — 네트워크·5xx는 다음 기회에 재시도하도록 유지한다.
 */
export async function flushPendingSessions(
  userId: number,
  store?: SessionFileStore,
): Promise<{ submitted: number; kept: number; dropped: number }> {
  const pending = await listPendingSessions(store);
  let submitted = 0;
  let kept = 0;
  let dropped = 0;

  for (const item of pending) {
    try {
      await submitStudySession(userId, item.payload);
      await removePendingSession(item.sessionId, store);
      submitted += 1;
    } catch (error) {
      if (error instanceof StudySessionSubmitError && error.status >= 400 && error.status < 500) {
        await removePendingSession(item.sessionId, store);
        console.warn(`[session-sync] ${item.sessionId} 제출 거부(4xx) — 큐에서 제거한다`, error);
        dropped += 1;
      } else {
        console.warn(`[session-sync] ${item.sessionId} 제출 실패 — 다음 기회에 재시도`, error);
        kept += 1;
      }
    }
  }

  return { submitted, kept, dropped };
}

/**
 * 앱 포그라운드 복귀 시 호출하는 진입점 — 소급 마감 → 큐 재전송 → 제출분이 있으면 통계 invalidate.
 * 사용자에게 오류를 노출하지 않는다: 모든 실패는 삼키고 console.warn만 남긴다.
 */
export async function syncSessionsOnAppActive(
  invalidate: () => void,
  nowMs?: number,
  store?: SessionFileStore,
): Promise<void> {
  if (syncing) {
    return;
  }

  syncing = true;
  try {
    const userId = await ensureUserRegistered();
    if (userId === null) {
      return;
    }

    await completePendingCheckpoint(nowMs ?? Date.now(), store);
    const { submitted } = await flushPendingSessions(userId, store);
    if (submitted > 0) {
      invalidate();
    }
  } catch (error) {
    console.warn("[session-sync] 세션 동기화 실패", error);
  } finally {
    syncing = false;
  }
}
