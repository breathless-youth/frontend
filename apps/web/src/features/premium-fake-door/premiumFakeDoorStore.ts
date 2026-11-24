import { EMPTY_PREMIUM_RECORD, type PremiumFakeDoorRecord } from "./premiumFakeDoor";

/**
 * 사용자별 노출 기록 저장
 *
 * 결과 화면 문서가 세션마다 새로 열려도 같은 기록을 보도록 localStorage에 둔다.
 * 지워지면 카드가 한 번 더 보일 뿐이라 네이티브 저장소를 쓰지 않는다.
 * 읽기(`loadPremiumRecord`)는 저장소를 바꾸지 않는다. 예전 기록 옮기기는 `migrateLegacyDismissal`이 따로 한다.
 */
const keyFor = (userId: number) => `focusmakers.premiumFakeDoor.v1.${userId}`;

function parseRecord(raw: string): PremiumFakeDoorRecord {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const dismissedAt = typeof parsed.dismissedAt === "number" ? parsed.dismissedAt : null;
  return {
    dismissedAt,
    legacyDismissed: dismissedAt === null && parsed.dismissed === true,
    applied: parsed.applied === true,
    viewedSent: parsed.viewedSent === true,
  };
}

/** 저장 모양. 아직 옮기지 못한 예전 기록은 `dismissed: true`를 그대로 남긴다. */
function serialize(record: PremiumFakeDoorRecord): string {
  const { legacyDismissed, ...rest } = record;
  return JSON.stringify(
    legacyDismissed && record.dismissedAt === null ? { ...rest, dismissed: true } : rest,
  );
}

/** 읽지 못하면 null이다. 화면은 카드를 그리지 않는 쪽으로 떨어진다. */
export function loadPremiumRecord(userId: number): PremiumFakeDoorRecord | null {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    return raw === null ? EMPTY_PREMIUM_RECORD : parseRecord(raw);
  } catch (error) {
    console.warn("[premium-fake-door] failed to read record, not showing the card", error);
    return null;
  }
}

/** 쓰기에 실패해도 화면 흐름을 막지 않는다. */
export function updatePremiumRecord(userId: number, patch: Partial<PremiumFakeDoorRecord>): void {
  const current = loadPremiumRecord(userId) ?? EMPTY_PREMIUM_RECORD;
  const next = { ...current, ...patch };
  // 닫은 시각이 생기면 더는 예전 기록이 아니다.
  if (next.dismissedAt !== null) next.legacyDismissed = false;
  try {
    localStorage.setItem(keyFor(userId), serialize(next));
  } catch (error) {
    console.warn("[premium-fake-door] failed to save record", error);
  }
}

/**
 * 예전 닫은 기록 옮기기
 *
 * 닫으면 영영 숨기던 예전 기록(`dismissed: true`, 시각 없음)을 이 함수를 처음 부른 때 닫은 것으로 옮겨 저장한다.
 * 그래서 예전에 닫은 사람도 그 뒤 48시간이 지나면 카드를 다시 본다.
 * 저장에 실패하면 예전 기록으로 남겨 예전처럼 숨긴다. 그러면 읽을 때마다 48시간이 다시 시작되는 일이 없다.
 * 이미 옮겼거나 예전 기록이 아니면 아무것도 하지 않는다.
 */
export function migrateLegacyDismissal(userId: number, nowMs: number): void {
  const record = loadPremiumRecord(userId);
  if (record === null || !record.legacyDismissed) return;
  try {
    localStorage.setItem(
      keyFor(userId),
      serialize({ ...record, dismissedAt: nowMs, legacyDismissed: false }),
    );
  } catch (error) {
    console.warn(
      "[premium-fake-door] failed to migrate legacy dismissal, keeping it hidden",
      error,
    );
  }
}
