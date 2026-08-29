/**
 * 앱 미설치 브라우저를 스토어로 보내는 링크
 *
 * - Android: Play의 `referrer` 파라미터에 초대코드를 실어 설치 후 첫 실행에서 복원한다(Install Referrer).
 * - iOS: 스토어가 값을 앱에 전달할 공식 통로가 없어 페이지 이동만 한다(추후 Branch, OneLink 등으로 대체 가능).
 */
const ANDROID_PACKAGE = "com.breathlessyouth.mobile";
const IOS_APP_ID = "6797220287";

export function detectStorePlatform(
  userAgent: string,
  maxTouchPoints: number,
): "android" | "ios" | null {
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  // iPadOS 13+의 Safari는 기본 설정(데스크톱 웹사이트 요청)에서 맥과 같은 UA를 보낸다 —
  // UA만으로는 진짜 맥과 구분할 수 없어 멀티터치 지원 여부로 가른다.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  return null;
}

export function storeLink(platform: "android" | "ios", inviteCode: string): string {
  if (platform === "android") {
    const referrer = encodeURIComponent(`code=${inviteCode}`);
    return `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}&referrer=${referrer}`;
  }
  return `https://apps.apple.com/app/id${IOS_APP_ID}`;
}
