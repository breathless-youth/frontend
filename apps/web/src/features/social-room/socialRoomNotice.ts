/**
 * 룸에서 밀려난 사유를 소셜 홈으로 전달 (2026-08-25 BY-436)
 *
 * 재입장 실패로 방을 떠날 때 사용자에게 이유를 알려야 하는데, 그 문구를 띄울 화면은
 * 이미 언마운트되는 룸이 아니라 도착지인 소셜 홈이다. `profileSavedNotice`와 같은
 * sessionStorage 1회성 플래그로 넘긴다 — router state로 실으면 웹뷰가 또 리로드될 때
 * 같은 history 항목이 복원되며 토스트가 반복된다(이 버그의 발단이 웹뷰 리로드다).
 */
const KEY = "focusmakers:social-room-notice";

export function markSocialRoomNotice(message: string): void {
  try {
    sessionStorage.setItem(KEY, message);
  } catch {
    // 스토리지 불가 환경(프라이빗 모드 등)에서는 토스트만 조용히 생략된다 — 이동 자체는 된다.
  }
}

/** 문구를 읽고 지운다 — 소셜 홈 재진입·새로고침에 같은 안내가 반복되지 않게 1회성이다. */
export function consumeSocialRoomNotice(): string | null {
  try {
    const message = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return message;
  } catch {
    return null;
  }
}
