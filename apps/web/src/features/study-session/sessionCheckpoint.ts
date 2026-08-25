import type { StatusEventPayload } from "@focusmakers/types";

/**
 * 비정상 종료 대비 세션 체크포인트 — localStorage에 세션당 한 키.
 */
export interface PendingSessionRecord {
  userId: number;
  startedAtMs: number;
  lastSeenMs: number;
  studySec: number;
  focusSec: number;
  events: StatusEventPayload[];
}

const KEY_PREFIX = "focusmakers.pendingSession.v1.";

function keyOf(startedAtMs: number): string {
  return `${KEY_PREFIX}${startedAtMs}`;
}

function isRecord(value: unknown): value is PendingSessionRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Number.isFinite(record.userId) &&
    Number.isFinite(record.startedAtMs) &&
    Number.isFinite(record.lastSeenMs) &&
    Number.isFinite(record.studySec) &&
    Number.isFinite(record.focusSec) &&
    Array.isArray(record.events) &&
    // 원소가 null이면 제출 요청 조립(pauseMsOf)에서 서버 호출 전에 던져, 400 정리 경로에도
    // 못 가고 매 실행 반복된다 — 겉모양만 확인해 걸러낸다.
    record.events.every((event) => typeof event === "object" && event !== null)
  );
}

export function saveCheckpoint(record: PendingSessionRecord): void {
  try {
    localStorage.setItem(keyOf(record.startedAtMs), JSON.stringify(record));
  } catch {
    // 시크릿 모드·용량 초과 등 — 저장만 포기한다
  }
}

export function listCheckpoints(): PendingSessionRecord[] {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key !== null && key.startsWith(KEY_PREFIX)) {
        keys.push(key);
      }
    }

    const records: PendingSessionRecord[] = [];
    for (const key of keys) {
      let valid = false;
      try {
        const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "");
        // 키의 시각과 본문이 일치해야 한다 — 어긋난 레코드는 제출 성공 후 삭제가 다른 키를
        // 지워서, 남은 키가 실행마다 다시제출·토스트를 반복하게 된다.
        if (isRecord(parsed) && keyOf(parsed.startedAtMs) === key) {
          records.push(parsed);
          valid = true;
        }
      } catch {
        // 깨진 레코드 — 아래에서 지운다
      }
      if (!valid) {
        // 걸러지기만 하면 어떤 삭제 경로도 타지 못해 기기에 영구히 쌓인다.
        localStorage.removeItem(key);
      }
    }
    return records;
  } catch {
    return [];
  }
}

export function deleteCheckpoint(startedAtMs: number): void {
  try {
    localStorage.removeItem(keyOf(startedAtMs));
  } catch {
    // 무시
  }
}
