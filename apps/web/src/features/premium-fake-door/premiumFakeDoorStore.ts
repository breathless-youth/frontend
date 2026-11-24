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
    const parsed = JSON.parse(raw) as Partial<Record<keyof PremiumFakeDoorRecord, unknown>>;
    const flag = (key: keyof PremiumFakeDoorRecord) => parsed[key] === true;
    return {
      dismissed: flag("dismissed"),
      applied: flag("applied"),
      viewedSent: flag("viewedSent"),
    };
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
