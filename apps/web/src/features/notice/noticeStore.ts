/**
 * 공지 표시 기록
 *
 * 다시 보지 않기는 영구라 localStorage에, 이번 실행 표시 여부는 sessionStorage에 둔다.
 * 홈 문서는 /interview 같은 문서 단위 이동 뒤 다시 열리므로 메모리 변수로는 같은 실행을 알 수 없다.
 * 웹뷰를 새로 만드는 콜드 스타트에서는 sessionStorage가 비어 새 실행이 된다.
 * 두 값 모두 읽지 못하면 띄우지 않는 쪽으로 답한다.
 */

const DISMISSED_PREFIX = "focuson.noticeDismissed.";
const SHOWN_THIS_LAUNCH_KEY = "focuson.notice.shownThisLaunch";

export function isNoticeDismissed(id: number): boolean {
  try {
    return localStorage.getItem(`${DISMISSED_PREFIX}${id}`) === "1";
  } catch (error) {
    console.warn("[notice] 다시 보지 않기 기록을 읽지 못해 띄우지 않는다", error);
    return true;
  }
}

export function markNoticeDismissed(id: number): void {
  try {
    localStorage.setItem(`${DISMISSED_PREFIX}${id}`, "1");
  } catch (error) {
    console.warn("[notice] 다시 보지 않기를 저장하지 못했다", error);
  }
}

export function hasShownNoticeThisLaunch(): boolean {
  try {
    return sessionStorage.getItem(SHOWN_THIS_LAUNCH_KEY) === "1";
  } catch (error) {
    console.warn("[notice] 이번 실행 표시 여부를 읽지 못해 띄우지 않는다", error);
    return true;
  }
}

export function markNoticeShownThisLaunch(): void {
  try {
    sessionStorage.setItem(SHOWN_THIS_LAUNCH_KEY, "1");
  } catch (error) {
    console.warn("[notice] 이번 실행 표시 여부를 저장하지 못했다", error);
  }
}
