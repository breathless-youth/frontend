import { isNativeBridgeAvailable, postToNative } from "@/lib/bridge";

/**
 * 초대코드 복사·공유. 실패해도 화면을 깨지 않는다 — 결과를 돌려주고 화면이 토스트로 알린다.
 *
 * 2026-08-20 실기기·에뮬레이터 실측: iOS WKWebView는 `navigator.share` 시트가 뜨고,
 * Android 웹뷰는 Web Share API 자체가 없다(Chrome 브라우저 전용). 그래서 Android 웹뷰는
 * 브리지(`share` → RN `Share.share`)로 네이티브 시트를 열고, 순수 브라우저에서만
 * 클립보드 복사로 폴백한다.
 */

/**
 * 초대 링크 — 참여 화면을 코드가 채워진 채로 연다(`InviteCodeJoinPage`의 `?code` 프리필).
 * 오리진은 지금 떠 있는 웹 그대로 쓴다: 프로덕션 웹뷰면 배포 도메인, dev면 dev 서버 —
 * 환경별 상수를 두지 않고도 받는 쪽이 항상 보낸 쪽과 같은 환경에 도착한다.
 */
export function inviteLink(inviteCode: string): string {
  return `${window.location.origin}/social/join?code=${inviteCode}`;
}

export function inviteShareText(inviteCode: string): string {
  return `그룹 스터디에 초대받았어요!\n\n${inviteLink(inviteCode)}\n\n초대코드: ${inviteCode}`;
}

/** 클립보드 복사. secure context(https·localhost)가 아니거나 거부되면 false. */
export async function copyInviteCode(inviteCode: string): Promise<boolean> {
  return copyText(inviteCode);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * OS 공유 시트를 연다: `navigator.share`(iOS 웹뷰·일반 브라우저) → 브리지(Android 웹뷰) →
 * 클립보드 복사(순수 브라우저) 순.
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
  if (isNativeBridgeAvailable()) {
    // 시트는 네이티브가 연다. 응답 왕복은 없다 — 노출·취소 피드백은 OS가 준다(계약 주석).
    postToNative({ type: "share", text: inviteShareText(inviteCode), atMs: Date.now() });
    return "shared";
  }
  // 폴백은 코드만이 아니라 **공유하려던 텍스트 전체**(링크 포함)를 복사한다.
  return (await copyText(inviteShareText(inviteCode))) ? "copied" : "failed";
}
