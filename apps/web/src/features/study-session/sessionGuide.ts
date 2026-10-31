/**
 * 세션 도움말의 기기 기록·노출 판정
 *
 * 세션 도움말은 모든 사용자에게 뜨고, 마지막 단계의 `순공 시작하기`까지 끝낸 계정만 다시 뜨지 않는다.
 * 앱을 끄거나 Escape로 닫아 끝까지 보지 못한 계정은 다음 세션에 다시 뜬다.
 * 기록은 기기 저장소에 계정별로 남기므로 기기를 바꾸거나 저장소를 쓸 수 없는 기기에서는 다시 뜬다.
 */
export type SessionGuideState = "seen" | null;

const keyOf = (userId: number) => `focusmakers:session-guide:${userId}`;

export function sessionGuideState(userId: number): SessionGuideState {
  try {
    return localStorage.getItem(keyOf(userId)) === "seen" ? "seen" : null;
  } catch {
    return null;
  }
}

export function markSessionGuideSeen(userId: number): void {
  try {
    localStorage.setItem(keyOf(userId), "seen");
  } catch {
    // 남기지 못하면 다음 세션에 한 번 더 보일 뿐이다.
  }
}

/** 끝까지 본 계정이 아니면 띄우고, 과목 페이지·타이머 화면·대화상자 같은 다른 화면이 열려 있는 동안은 숨긴다. */
export function shouldShowSessionGuide(input: {
  state: SessionGuideState;
  blocked: boolean;
}): boolean {
  return !input.blocked && input.state !== "seen";
}
