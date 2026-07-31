/**
 * 서버 통계 귀속 날짜(statDate)는 KST 기준이다(위키 서버 전송 계약).
 * 기기 시간대와 무관하게 KST 날짜 키를 만든다 — UTC+9를 더한 뒤 UTC 게터로 읽는다.
 * (`apps/mobile/lib/dateKst.ts`에서 이식 — BY-329)
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function todayKstDateKey(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${month}-${day}`;
}
