import { isNativeBridgeAvailable } from "./bridge";

// 앱 안 이동은 URL에서 쿼리를 지우므로 모듈을 읽는 시점에 한 번 판정해 보관한다.
// 표시는 바이너리마다 고정이라 다시 읽을 이유가 없다.
function readAlertHapticFlag(): boolean {
  return new URLSearchParams(window.location.search).get("alertHaptic") === "1";
}

let alertHapticFlagCache: boolean | null = readAlertHapticFlag();

/**
 * `alert` 햅틱을 보낼 수 있는지
 *
 * 셸이 웹뷰 주소에 싣는 `alertHaptic=1`로 가른다.
 * 구버전 앱의 파서는 모르는 세기를 버려서 표시 없는 앱에 보내면 진동이 아예 나지 않는다.
 * 셸이 없는 브라우저는 진동 길이로 바꿔 내므로 참이다.
 */
export function hasAlertHaptic(): boolean {
  if (!isNativeBridgeAvailable()) {
    return true;
  }
  alertHapticFlagCache ??= readAlertHapticFlag();
  return alertHapticFlagCache;
}

/**
 * 테스트용 알림 햅틱 판정 초기화
 *
 * 테스트마다 URL을 바꿔 판정하도록 캐시를 비운다.
 */
export function __resetAlertHapticForTests(): void {
  alertHapticFlagCache = null;
}
