/**
 * 초대코드(숫자 4자리) 입력 정리·검증 - "코드는 숫자 4자리 문자열로 비교한다".
 * 앞자리 0을 보존해야 하므로 **어디서도 number로 변환하지 않는다** (예: "0712").
 */

/** 입력·붙여넣기 문자열에서 숫자만 남기고 4자로 자른다 (`"코드: 3712"` → `"3712"`). */
export function sanitizeInviteCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 4);
}

/** 참여하기 버튼 활성 조건 */
export function isCompleteInviteCode(code: string): boolean {
  return /^\d{4}$/.test(code);
}
