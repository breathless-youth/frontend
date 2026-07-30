/** URL 쿼리 등 외부 입력에서 온 userId 문자열을 검증한다 — 양의 정수만 유효, 그 외 null. */
export function parseUserId(raw: string | null): number | null {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
