/**
 * 첫 세션 안내 코치마크의 기기 기록과 노출 판정
 *
 * 과목을 만든 적 없는 계정의 홈에서 시작 버튼을 가리키는 안내를 한 번만 보이려고 둔다.
 * 서버에는 사용자별 표시를 둘 자리가 없어 `subjectHistory.ts`처럼 기기 저장소에 계정별로 남긴다.
 * 저장소를 쓸 수 없는 기기에서는 늘 본 적 없는 것으로 보고, 닫은 기록도 못 남겨 다음 방문에 한 번 더 보일 뿐이다.
 */
export type StartGuideState = "seen" | "replay" | null;

const keyOf = (userId: number) => `focusmakers:start-guide:${userId}`;

export function startGuideState(userId: number): StartGuideState {
  try {
    const value = localStorage.getItem(keyOf(userId));
    return value === "seen" || value === "replay" ? value : null;
  } catch {
    return null;
  }
}

function write(userId: number, value: "seen" | "replay"): void {
  try {
    localStorage.setItem(keyOf(userId), value);
  } catch {
    // 남기지 못하면 다음 방문에 한 번 더 보일 뿐이다.
  }
}

export const markStartGuideSeen = (userId: number): void => write(userId, "seen");
export const requestStartGuideReplay = (userId: number): void => write(userId, "replay");

/** iPadOS 웹뷰는 기본이 데스크톱 모드라 UA가 맥과 같다. `storeLink.ts`와 같은 규칙으로 멀티터치로 가른다. */
export function isIPad(userAgent: string, maxTouchPoints: number): boolean {
  return /iPad/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

/**
 * 다시 보기는 과목 유무와 상관없이 띄운다. 그 밖에는 과목을 만든 적 없는 첫 방문에 한 번이다.
 * 재생 원 앱의 iPad는 탭 바가 위에 있어 웹이 재생 원을 가리킬 수 없다.
 */
export function shouldShowStartGuide(input: {
  firstVisit: boolean;
  isToday: boolean;
  popupFree: boolean;
  state: StartGuideState;
  tabBarPlay: boolean;
  iPad: boolean;
}): boolean {
  if (!input.isToday || !input.popupFree || (input.tabBarPlay && input.iPad)) {
    return false;
  }
  return input.state === "replay" || (input.firstVisit && input.state === null);
}
