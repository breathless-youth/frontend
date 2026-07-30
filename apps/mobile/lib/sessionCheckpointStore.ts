import type { SessionCheckpoint } from "@focuson/study-core";

import { sessionFileStore, type SessionFileStore } from "./sessionFileStore";

/** `focuson/` 아래 상대 경로 — 어댑터가 documentDirectory + focuson/을 앞에 붙인다. */
const CHECKPOINT_PATH = "checkpoint.json";

function isSessionCheckpoint(value: unknown): value is SessionCheckpoint {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { schemaVersion?: unknown }).schemaVersion === 1
  );
}

/** 항상 최신 체크포인트 1개만 유지한다 — 덮어쓰기. */
export async function saveCheckpoint(
  checkpoint: SessionCheckpoint,
  store: SessionFileStore = sessionFileStore,
): Promise<void> {
  await store.writeAtomic(CHECKPOINT_PATH, JSON.stringify(checkpoint));
}

/** 파싱 실패이거나 schemaVersion이 1이 아니면 손상 파일을 삭제하고 null을 반환한다. */
export async function readCheckpoint(
  store: SessionFileStore = sessionFileStore,
): Promise<SessionCheckpoint | null> {
  const contents = await store.read(CHECKPOINT_PATH);
  if (contents === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    console.warn("[session-checkpoint] 체크포인트 JSON 파싱 실패 — 손상 파일을 삭제한다", error);
    await store.remove(CHECKPOINT_PATH);
    return null;
  }

  if (!isSessionCheckpoint(parsed)) {
    console.warn("[session-checkpoint] schemaVersion 불일치 — 손상 파일을 삭제한다");
    await store.remove(CHECKPOINT_PATH);
    return null;
  }

  return parsed;
}

export async function clearCheckpoint(store: SessionFileStore = sessionFileStore): Promise<void> {
  await store.remove(CHECKPOINT_PATH);
}
