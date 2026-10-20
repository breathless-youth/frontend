import { setAppLockEnabledUserProperty } from "@/lib/amplitude";

/**
 * 방해 앱 잠금 켜짐 여부
 *
 * 설정은 탭 웹뷰, 잠금 요청은 세션 웹뷰라 서로 다른 document여서 같은 주소끼리 공유되는 localStorage에 둔다.
 * 프라이버시 모드에서는 접근 자체가 던질 수 있어 읽기 실패는 꺼짐으로 본다.
 */
const KEY = "focusmakers.appLock.enabled";

export function readAppLockEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** 켜짐이 바뀌는 길은 모두 여기를 지나서 유저 속성도 여기서 맞춘다. */
export function writeAppLockEnabled(enabled: boolean): void {
  setAppLockEnabledUserProperty(enabled);
  try {
    localStorage.setItem(KEY, enabled ? "1" : "0");
  } catch (error) {
    console.warn("[app-lock] 켜짐 저장 실패", error);
  }
}
