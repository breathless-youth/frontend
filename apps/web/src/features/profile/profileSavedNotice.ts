/**
 * 프로필 저장 완료 알림 전달 (2026-08-25 BY-427 시안 A — 설정 복귀 후 토스트)
 *
 * 저장 성공 복귀는 스택이 있으면 `navigate(-1)`이라 router state에 실을 수 없다 —
 * sessionStorage 1회성 플래그로 전달하고 설정 화면이 마운트에서 소비한다.
 */
const KEY = "focusmakers:profile-saved-notice";

export function markProfileSaved(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // 스토리지 불가 환경(프라이빗 모드 등)에서는 토스트만 조용히 생략된다 — 저장 자체는 성공.
  }
}

/** 플래그를 읽고 지운다 — 설정 화면 재진입·새로고침에 토스트가 반복되지 않게 1회성이다. */
export function consumeProfileSavedNotice(): boolean {
  try {
    const marked = sessionStorage.getItem(KEY) !== null;
    sessionStorage.removeItem(KEY);
    return marked;
  } catch {
    return false;
  }
}
