const KEY = "focusmakers.pc.session";

/**
 * 이 탭에서 연 공부 세션의 계정 번호
 *
 * 새로고침 뒤 이 탭이 연 세션만 이어 가려고 탭마다 따로인 sessionStorage에 남긴다.
 * 다른 탭이나 다른 기기에서 연 세션은 표시가 없어 이어 가지 않는다.
 * 저장소를 못 쓰면 표시 없이 지나가고, 새로고침하면 홈으로 돌아온다.
 */
export function readPcSessionMarker(): number | null {
  try {
    const value = Number(sessionStorage.getItem(KEY));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writePcSessionMarker(userId: number): void {
  try {
    sessionStorage.setItem(KEY, String(userId));
  } catch {
    // 표시를 남기지 못하면 새로고침 뒤 이어 가지 못할 뿐 이번 세션은 그대로 돈다.
  }
}

export function clearPcSessionMarker(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // 못 지운 표시는 다음 새로고침에서 서버 기록이 없으면 지워진다.
  }
}
