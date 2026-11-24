import { EMPTY_PREMIUM_RECORD, type PremiumFakeDoorRecord } from "./premiumFakeDoor";

/**
 * 사용자별 노출 기록 저장
 *
 * 결과 화면 문서가 세션마다 새로 열려도 같은 기록을 보도록 localStorage에 둔다.
 * 지워지면 카드가 한 번 더 보일 뿐이라 네이티브 저장소를 쓰지 않는다.
 */
const keyFor = (userId: number) => `focusmakers.premiumFakeDoor.v1.${userId}`;

/** 읽지 못하면 null이다. 화면은 카드를 그리지 않는 쪽으로 떨어진다. */
export function loadPremiumRecord(userId: number): PremiumFakeDoorRecord | null {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (raw === null) return EMPTY_PREMIUM_RECORD;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const record: PremiumFakeDoorRecord = {
      dismissedAt: typeof parsed.dismissedAt === "number" ? parsed.dismissedAt : null,
      applied: parsed.applied === true,
      viewedSent: parsed.viewedSent === true,
    };
    // 닫으면 영영 숨기던 예전 기록(dismissed: true, 시각 없음)은 처음 읽은 때 닫은 것으로 보고 그 시각을 저장한다.
    // 그래서 예전에 닫은 사람도 이 배포 뒤 48시간이 지나면 카드를 다시 본다.
    if (record.dismissedAt === null && parsed.dismissed === true) {
      record.dismissedAt = Date.now();
      try {
        localStorage.setItem(keyFor(userId), JSON.stringify(record));
      } catch {
        // 저장하지 못하면 다음에 읽을 때 다시 옮긴다.
      }
    }
    return record;
  } catch (error) {
    console.warn("[premium-fake-door] failed to read record, not showing the card", error);
    return null;
  }
}

/** 쓰기에 실패해도 화면 흐름을 막지 않는다. */
export function updatePremiumRecord(userId: number, patch: Partial<PremiumFakeDoorRecord>): void {
  const current = loadPremiumRecord(userId) ?? EMPTY_PREMIUM_RECORD;
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify({ ...current, ...patch }));
  } catch (error) {
    console.warn("[premium-fake-door] failed to save record", error);
  }
}
