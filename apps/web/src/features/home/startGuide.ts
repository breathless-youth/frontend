/**
 * 첫 세션 안내 코치마크의 기기 기록과 노출 판정
 *
 * 홈의 집중 시작 버튼을 가리키는 안내를, 버튼을 눌러 세션으로 넘어간 계정에는 다시 보이지 않으려고 둔다.
 * 서버에는 사용자별 표시를 둘 자리가 없어 `subjectHistory.ts`처럼 기기 저장소에 계정별로 남긴다.
 * 저장소를 쓸 수 없는 기기에서는 늘 본 적 없는 것으로 보고, 기록도 못 남겨 다음 홈 진입에 한 번 더 보일 뿐이다.
 */
export type StartGuideState = "seen" | null;

const keyOf = (userId: number) => `focusmakers:start-guide:${userId}`;

export function startGuideState(userId: number): StartGuideState {
  try {
    return localStorage.getItem(keyOf(userId)) === "seen" ? "seen" : null;
  } catch {
    return null;
  }
}

export function markStartGuideSeen(userId: number): void {
  try {
    localStorage.setItem(keyOf(userId), "seen");
  } catch {
    // 남기지 못하면 다음 홈 진입에 한 번 더 보일 뿐이다.
  }
}

/**
 * 신원이 없으면 본 기록을 남길 수 없어 띄우지 않는다.
 * 다른 홈 팝업이 있었던 실행에서는 겹치지 않도록 다음 홈 진입으로 미룬다.
 */
export function shouldShowStartGuide(input: {
  state: StartGuideState;
  popupOpen: boolean;
  userId: number | null;
}): boolean {
  return input.userId !== null && input.state !== "seen" && !input.popupOpen;
}
