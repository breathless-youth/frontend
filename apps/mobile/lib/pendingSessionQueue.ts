import type { SubmitPayload } from "@focuson/study-core";

import { sessionFileStore, type SessionFileStore } from "./sessionFileStore";

/** `focuson/` 아래 상대 디렉터리 — 어댑터가 documentDirectory + focuson/을 앞에 붙인다. */
const PENDING_DIR = "pending";

export interface PendingSession {
  sessionId: string;
  payload: SubmitPayload;
}

function pendingPath(sessionId: string): string {
  return `${PENDING_DIR}/${sessionId}.json`;
}

function isPendingSession(value: unknown): value is PendingSession {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { sessionId?: unknown }).sessionId === "string" &&
    typeof (value as { payload?: unknown }).payload === "object" &&
    (value as { payload?: unknown }).payload !== null
  );
}

export async function enqueuePendingSession(
  item: PendingSession,
  store: SessionFileStore = sessionFileStore,
): Promise<void> {
  await store.writeAtomic(pendingPath(item.sessionId), JSON.stringify(item));
}

/** 손상된 파일은 건너뛰고 삭제한 뒤 나머지를 반환한다. */
export async function listPendingSessions(
  store: SessionFileStore = sessionFileStore,
): Promise<PendingSession[]> {
  const fileNames = (await store.list(PENDING_DIR)).filter((name) => name.endsWith(".json"));
  const sessions: PendingSession[] = [];

  for (const fileName of fileNames) {
    // writeAtomic이 남긴 .tmp 고아 파일은 큐 항목이 아니다 — 다음 재시도가 덮어쓴다.
    const path = `${PENDING_DIR}/${fileName}`;
    const contents = await store.read(path);
    if (contents === null) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch (error) {
      console.warn(`[pending-session-queue] ${fileName} JSON 파싱 실패 — 건너뛰고 삭제한다`, error);
      await store.remove(path);
      continue;
    }

    if (!isPendingSession(parsed)) {
      console.warn(`[pending-session-queue] ${fileName} 형식이 올바르지 않다 — 건너뛰고 삭제한다`);
      await store.remove(path);
      continue;
    }

    sessions.push(parsed);
  }

  return sessions;
}

export async function removePendingSession(
  sessionId: string,
  store: SessionFileStore = sessionFileStore,
): Promise<void> {
  await store.remove(pendingPath(sessionId));
}
