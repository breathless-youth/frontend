/**
 * URL 쿼리 등 외부 입력에서 온 userId 문자열을 검증한다 — 십진 양의 정수만 유효, 그 외 null.
 *
 * `Number(raw)`만 쓰면 `"0x10"`(16)·`"1e2"`(100) 같은 비십진 표기가 통과하고,
 * MAX_SAFE_INTEGER를 넘는 문자열은 반올림된 엉뚱한 id가 된다 — 신뢰 경계라 표기를 자릿수로 못 박는다.
 */
export function parseUserId(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
