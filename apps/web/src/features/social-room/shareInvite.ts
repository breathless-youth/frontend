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

/**
 * 공유 시트에 넘길 본문. 링크는 `navigator.share`의 `url` 필드가 카드로 렌더하므로 본문에는
 * 넣지 않는다 — 본문에도 링크가 있으면 카톡이 같은 링크로 프리뷰를 한 번 더 만들어 말풍선이
 * 중복된다. 초대코드는 남겨 링크를 못 여는 경우의 안내로 쓴다.
 */
export function inviteShareBody(inviteCode: string): string {
  return `그룹 스터디에 초대받았어요!\n\n초대코드: ${inviteCode}`;
}

/**
 * 공유 시트 제목. text만 보내면 OS 공유시트가 한글 문구를 축소 렌더해 썸네일이 깨진
 * 텍스트 프리뷰로 뜬다(2026-08-24 실기기 확인, BY-427) — `title`·`url`을 별도 필드로
 * 실어 시트가 URL 미리보기 카드(앱 아이콘)를 그리게 한다. `navigator.share`의 text에는
 * 링크를 넣지 않는다 — url 필드가 카드를 그리므로 본문에도 링크가 있으면 카톡이 프리뷰를
 * 두 번 만든다(BY-584, `inviteShareBody`). 링크가 본문에 있어야 하는 브리지(url 무시)·
 * 클립보드(url 필드 없음) 경로만 `inviteShareText`를 그대로 쓴다.
 */
export const INVITE_SHARE_TITLE = "포커스 메이커스 그룹 스터디";

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
      // title·url을 별도 필드로 싣는 이유는 `INVITE_SHARE_TITLE` 주석 참고(썸네일 깨짐 방지).
      // text에는 링크를 넣지 않는다 — url 필드가 카드를 그리므로, 본문에도 링크가 있으면
      // 카톡이 같은 링크로 프리뷰를 두 번 만들어 말풍선이 중복된다(`inviteShareBody` 주석).
      await navigator.share({
        title: INVITE_SHARE_TITLE,
        text: inviteShareBody(inviteCode),
        url: inviteLink(inviteCode),
      });
      return "shared";
    } catch {
      // 사용자가 시트를 닫은 경우(AbortError) 포함 — 추가 동작 없이 조용히 끝낸다.
      return "failed";
    }
  }
  // 브리지 존재만으로는 부족하다 — `share` 수신 코드가 없는 구버전 앱은 메시지를 조용히
  // 버려 시트도 복사도 일어나지 않는다. 셸이 쿼리로 실어 보내는 지원 표시(`share=1`,
  // remoteQueryParams.ts)가 있을 때만 브리지를 쓴다.
  const bridgeShareSupported =
    isNativeBridgeAvailable() && new URLSearchParams(window.location.search).get("share") === "1";
  if (bridgeShareSupported) {
    // 시트는 네이티브가 연다. 응답 왕복은 없다 — 노출·취소 피드백은 OS가 준다(계약 주석).
    // url·title은 navigator.share와 같은 이유로 함께 싣는다 — 구버전 네이티브는 무시한다.
    postToNative({
      type: "share",
      text: inviteShareText(inviteCode),
      url: inviteLink(inviteCode),
      title: INVITE_SHARE_TITLE,
      atMs: Date.now(),
    });
    return "shared";
  }
  // 폴백은 코드만이 아니라 **공유하려던 텍스트 전체**(링크 포함)를 복사한다.
  return (await copyText(inviteShareText(inviteCode))) ? "copied" : "failed";
}
