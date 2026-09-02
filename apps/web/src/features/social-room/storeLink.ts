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
    const base = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
    if (inviteCode === "") return base;
    return `${base}&referrer=${encodeURIComponent(`code=${inviteCode}`)}`;
  }
  return `https://apps.apple.com/app/id${IOS_APP_ID}`;
}

/**
 * 앱스킴 스토어 링크 (강제 업데이트용)
 *
 * 위 `storeLink`는 https 웹 링크라 구버전 웹뷰의 내장 Linking이 앱 스킴만 가로채는 경우
 * 새 탭/외부 브라우저로 새는 사례가 있어, 강제 업데이트 확인 버튼은 앱 스킴(`itms-apps://`,
 * `market://`)으로 직접 스토어 앱을 연다. 초대코드 리퍼러가 필요 없어 별도 함수로 뺐다.
 * ID 상수는 위 것과 공유해 이중 관리를 피한다.
 */
export function storeSchemeUrl(platform: "android" | "ios"): string {
  if (platform === "android") return `market://details?id=${ANDROID_PACKAGE}`;
  return `itms-apps://apps.apple.com/app/id${IOS_APP_ID}`;
}
