/**
 * 초대코드 복사·공유. 실패해도 화면을 깨지 않는다 — 결과를 돌려주고 화면이 토스트로 알린다.
 *
 * WebView 실기기 검증 필요(PR 체크리스트): iOS WKWebView의 `navigator.share` 시트 노출,
 * Android RN WebView의 share 미지원 폴백, 양쪽 `navigator.clipboard` 동작.
 * 양쪽 다 share가 안 되면 그때 브리지 메시지(`share` → RN `Share.share`)를 추가한다.
 */

export function inviteShareText(inviteCode: string): string {
  return `FocusMakers에서 함께 공부해요! 초대코드: ${inviteCode}`;
}

/** 클립보드 복사. secure context(https·localhost)가 아니거나 거부되면 false. */
export async function copyInviteCode(inviteCode: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(inviteCode);
    return true;
  } catch {
    return false;
  }
}

/**
 * OS 공유 시트를 연다. `navigator.share` 미지원(Android RN WebView 가능성 높음)이면
 * 복사로 폴백한다
 */
export async function shareInvite(inviteCode: string): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ text: inviteShareText(inviteCode) });
      return "shared";
    } catch {
      // 사용자가 시트를 닫은 경우(AbortError) 포함 — 추가 동작 없이 조용히 끝낸다.
      return "failed";
    }
  }
  return (await copyInviteCode(inviteCode)) ? "copied" : "failed";
}
