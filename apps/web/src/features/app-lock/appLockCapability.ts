import { isNativeBridgeAvailable } from "@/lib/bridge";

// 앱 안 이동은 URL에서 쿼리를 지우므로 모듈을 읽는 시점에 한 번 판정해 보관한다.
// 표시는 바이너리마다 고정이라 다시 읽을 이유가 없다.
function readAppLockFlag(): boolean {
  return new URLSearchParams(window.location.search).get("appLock") === "1";
}

let appLockFlagCache: boolean | null = readAppLockFlag();

/**
 * 방해 앱 잠금을 앱에 맡길 수 있는지
 *
 * 셸이 웹뷰 주소에 싣는 `appLock=1`로 가른다.
 * 원격 웹은 스크린타임 모듈이 없는 구버전 앱에도 바로 배포되어 브리지만으로는 알 수 없다.
 */
export function hasAppLockCapability(): boolean {
  if (!isNativeBridgeAvailable()) {
    return false;
  }
  appLockFlagCache ??= readAppLockFlag();
  return appLockFlagCache;
}

/** 테스트마다 URL을 바꿔 판정하도록 캐시를 비운다. */
export function __resetAppLockCapabilityForTests(): void {
  appLockFlagCache = null;
}
