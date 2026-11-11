import { detectStorePlatform, storeLink } from "@/features/social-room/storeLink";

/** 앱 밖 브라우저에서 앱 설치 화면으로 보낸다. 기기를 알 수 없으면 App Store 주소를 쓴다. */
export function openAppStore(): void {
  const platform = detectStorePlatform(navigator.userAgent, navigator.maxTouchPoints);
  window.open(storeLink(platform ?? "ios", ""), "_blank", "noopener");
}
