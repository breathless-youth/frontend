/**
 * 프로필 저장 완료 알림 전달
 *
 * 저장에 성공하면 설정 화면으로 돌아가 거기서 토스트를 띄운다.
 * 돌아가는 길이 `navigate(-1)`이라 router state에 실을 수 없어 sessionStorage의 1회성 표시로 넘긴다.
 */
const KEY = "focusmakers:profile-saved-notice";

export function markProfileSaved(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // 저장소를 못 쓰는 환경(프라이빗 모드 등)에서는 토스트만 빠지고 저장은 이미 끝났다.
  }
}

/** 표시를 읽고 지운다. 설정 화면에 다시 들어오거나 새로고침해도 토스트가 반복되지 않는다. */
export function consumeProfileSavedNotice(): boolean {
  try {
    const marked = sessionStorage.getItem(KEY) !== null;
    sessionStorage.removeItem(KEY);
    return marked;
  } catch {
    return false;
  }
}
