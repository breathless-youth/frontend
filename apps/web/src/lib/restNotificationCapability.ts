import { isNativeBridgeAvailable } from "./bridge";

// 앱 안 이동은 URL에서 쿼리를 지우므로 모듈을 읽는 시점에 한 번 판정해 보관한다.
// 표시는 바이너리마다 고정이라 다시 읽을 이유가 없다.
function readRestNotifyFlag(): boolean {
  return new URLSearchParams(window.location.search).get("restNotify") === "1";
}

let restNotifyFlagCache: boolean | null = readRestNotifyFlag();

/**
 * 휴식 알림 말풍선을 보일 수 있는지
 *
 * 셸이 웹뷰 주소에 싣는 `restNotify=1`로 가른다. 로컬 알림 모듈이 없는 구버전 앱은 앱을 나가 있는 동안
 * 알릴 수 없어 말풍선 자체를 숨긴다. 셸이 없는 브라우저는 앱 안 알림만 쓰므로 참이다.
 */
export function hasRestNotification(): boolean {
  if (!isNativeBridgeAvailable()) {
    return true;
  }
  restNotifyFlagCache ??= readRestNotifyFlag();
  return restNotifyFlagCache;
}

/**
 * 테스트용 휴식 알림 판정 초기화
 *
 * 테스트마다 URL을 바꿔 판정하도록 캐시를 비운다.
 */
export function __resetRestNotificationForTests(): void {
  restNotifyFlagCache = null;
}
