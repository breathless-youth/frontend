/**
 * 프로필 입력 클라이언트 검증
 */

/** 닉네임: 2~12자, 한글·영문·숫자만. */
export function validateNickname(nickname: string): string | null {
  if (!/^[가-힣A-Za-z0-9]{2,12}$/.test(nickname)) {
    return "2~12자의 한글, 영문, 숫자만 쓸 수 있어요";
  }
  return null;
}

/**
 * 닉네임 길이만: 입력 중 실시간 안내용(12자 초과). 형식·최소 길이는 저장 시점의
 * `validateNickname`이 본다 — 타이핑 도중(1자, 조합 중)의 미완성 입력까지 실시간으로
 * 오류를 띄우면 정상 입력 과정이 계속 빨갛게 깜빡인다.
 */
export function validateNicknameLength(nickname: string): string | null {
  if (nickname.length > 12) {
    return "닉네임은 12자까지 쓸 수 있어요";
  }
  return null;
}

/** 목표 문구: 공백 포함 최대 20자. 빈 값은 허용(선택 항목 — null로 저장). */
export function validateGoal(goal: string): string | null {
  if (goal.length > 20) {
    return "목표는 20자까지 쓸 수 있어요";
  }
  return null;
}
