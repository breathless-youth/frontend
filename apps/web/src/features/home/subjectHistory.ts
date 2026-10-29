/**
 * 과목을 만든 적 있는 계정인지 기기에 남기는 기록
 *
 * 첫 세션 안내 코치마크를 처음 한 번만 보이려고 둔다.
 * 지운 과목은 그날 기록에만 남아 지금 과목 목록만으로는 과목을 만든 적 있는지 알 수 없다.
 * 저장소를 쓸 수 없는 기기에서는 늘 처음 온 사람으로 본다.
 */
const keyOf = (userId: number) => `focusmakers:subject-created:${userId}`;

export function hasCreatedSubject(userId: number): boolean {
  try {
    return localStorage.getItem(keyOf(userId)) === "1";
  } catch {
    return false;
  }
}

export function markSubjectCreated(userId: number): void {
  try {
    localStorage.setItem(keyOf(userId), "1");
  } catch {
    // 남기지 못하면 다음에 과목이 0개일 때 첫 세션 안내가 한 번 더 보일 뿐이다.
  }
}
