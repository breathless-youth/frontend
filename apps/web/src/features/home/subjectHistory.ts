/**
 * 과목을 만든 적 있는 계정인지 기기에 남기는 기록
 *
 * 과목이 0개인 홈에서 처음 온 사람에게는 환영 화면을, 과목을 모두 지운 사람에게는 빈 화면을 보이려고 둔다.
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
    // 남기지 못하면 다음에 과목이 0개일 때 환영 화면이 한 번 더 보일 뿐이다.
  }
}

/**
 * 과목 목록을 받은 뒤 홈 본문을 무엇으로 그릴지
 *
 * 과목을 만든 적 있는지는 기기 기록이나 그날 남은 기록 줄로 호출부가 판단한다.
 */
export function homeEmptyKind(
  liveCount: number,
  createdBefore: boolean,
): "list" | "welcome" | "empty" {
  if (liveCount > 0) {
    return "list";
  }
  return createdBefore ? "empty" : "welcome";
}
