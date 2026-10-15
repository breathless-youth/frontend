/**
 * 복구 창 표시 기록
 *
 * 홈 랭킹 팝업은 복구 창이 뜬 실행에 쉬어야 하는데, 복구 창은 그 실행의 첫 홈 문서에서만 뜬다.
 * 같은 실행의 다음 홈 문서도 알 수 있게 공지의 '이번 실행에 띄움'처럼 sessionStorage에 둔다.
 * 웹뷰를 새로 만드는 콜드 스타트에서는 비어 새 실행이 된다.
 * 읽지 못하면 떴다고 답해 랭킹 팝업이 겹치지 않게 한다.
 */

const SHOWN_THIS_LAUNCH_KEY = "focuson.recovery.shownThisLaunch";

export function hasShownRecoveryThisLaunch(): boolean {
  try {
    return sessionStorage.getItem(SHOWN_THIS_LAUNCH_KEY) === "1";
  } catch (error) {
    console.warn("[recovery] 이번 실행 복구 창 기록을 읽지 못해 떴다고 본다", error);
    return true;
  }
}

export function markRecoveryShownThisLaunch(): void {
  try {
    sessionStorage.setItem(SHOWN_THIS_LAUNCH_KEY, "1");
  } catch (error) {
    console.warn("[recovery] 이번 실행 복구 창 기록을 저장하지 못했다", error);
  }
}
