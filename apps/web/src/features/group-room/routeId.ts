/**
 * 주소의 그룹 번호와 신청 번호
 *
 * 주소는 사용자가 고칠 수 있어 십진 양의 정수만 번호로 보고 나머지는 null이다.
 */
export function parseRouteId(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return null;
  }
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
