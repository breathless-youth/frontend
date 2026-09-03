import { storeSchemeUrl } from "@/features/social-room/storeLink";

export function navigateToStore(url: string): void {
  window.location.href = url;
}

/**
 * 스토어 앱을 연다(강제 업데이트 확인 버튼 클릭 시).
 * — 호출부(`useForceUpdateGate`)가 플랫폼을 이미 판정해 강제 여부를 정한 값을 그대로 받는다.
 * 판정을 여기서 한 번 더 하면 강제 여부를 정할 때 쓴 판정과 실제 이동 때 쓴 판정이 어긋날 여지가 생긴다.
 */
export function openAppStore(
  platform: "android" | "ios",
  navigate: (url: string) => void = navigateToStore,
): void {
  navigate(storeSchemeUrl(platform));
}
