import { storeLink } from "./storeLink";

const APP_SCHEME = "focusmakers";
const ANDROID_PACKAGE = "com.breathlessyouth.mobile";
const DEEP_LINK_PATH = "social/join";
const IOS_STORE_FALLBACK_MS = 1500;

/** 초대코드를 실은 앱 딥링크. 코드가 없으면 경로만. */
export function appSchemeUrl(code: string): string {
  return code === ""
    ? `${APP_SCHEME}://${DEEP_LINK_PATH}`
    : `${APP_SCHEME}://${DEEP_LINK_PATH}?code=${encodeURIComponent(code)}`;
}

/**
 * Android intent URL. 이 문법은 앱이 있으면 앱을, 없으면 browser_fallback_url을 브라우저가
 * 알아서 연다 — iOS와 달리 타이머 폴백이 필요 없다. 폴백은 Install Referrer가 실린 스토어 링크다.
 */
export function androidIntentUrl(code: string): string {
  const query = code === "" ? "" : `?code=${encodeURIComponent(code)}`;
  const fallback = encodeURIComponent(storeLink("android", code));
  return `intent://${DEEP_LINK_PATH}${query}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`;
}

// 카카오톡·인스타그램·네이버·라인·페이스북 인앱 브라우저의 UA 토큰.
const IN_APP_TOKENS: readonly RegExp[] = [
  /KAKAOTALK/i,
  /Instagram/i,
  /NAVER\(inapp/i,
  /\bLine\//i,
  /FBAN|FBAV/i,
  /DaumApps/i,
];

/** 인앱 브라우저 UA 감지. best-effort라 실패해도 버튼 경로가 안전망이다. */
export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP_TOKENS.some((re) => re.test(userAgent));
}

/** 첫 로드 자동 발사 조건: 인앱 브라우저이고 초대코드가 있을 때만. */
export function shouldAutoOpenInApp(userAgent: string, code: string): boolean {
  return code !== "" && isInAppBrowser(userAgent);
}

type Navigate = (url: string) => void;
const defaultNavigate: Navigate = (url) => {
  window.location.href = url;
};

/**
 * 앱을 연다. 웹은 설치 여부를 알 수 없어 "일단 열고 실패하면 스토어" 패턴을 쓴다.
 * Android는 intent 문법이 폴백을 내장하므로 이동 한 번으로 끝난다.
 * iOS는 스킴을 연 뒤 타이머로 스토어 폴백을 걸되, 앱으로 전환되면(페이지가 숨거나 언로드)
 * 타이머를 취소해 앱과 스토어가 겹쳐 열리는 것을 막는다.
 */
export function openInApp(
  platform: "android" | "ios",
  code: string,
  deps: { navigate?: Navigate } = {},
): void {
  const navigate = deps.navigate ?? defaultNavigate;
  if (platform === "android") {
    navigate(androidIntentUrl(code));
    return;
  }

  const cleanup = () => {
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", cleanup);
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") cleanup();
  };
  const timer = window.setTimeout(() => {
    cleanup();
    navigate(storeLink("ios", code));
  }, IOS_STORE_FALLBACK_MS);

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", cleanup);
  navigate(appSchemeUrl(code));
}
