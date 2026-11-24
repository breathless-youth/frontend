import { isNativeBridgeAvailable } from "./bridge";

// 앱 안 이동은 URL에서 쿼리를 없애므로 모듈을 읽는 시점에 한 번 판정해 보관한다.
// 표시는 바이너리마다 고정이라 다시 읽을 이유가 없다.
function readLiveActivityFlag(): boolean {
  return new URLSearchParams(window.location.search).get("liveActivity") === "1";
}

let liveActivityFlagCache: boolean | null = readLiveActivityFlag();

/**
 * 잠금화면 공부 표시 상태를 앱에 보낼 수 있는지
 *
 * 셸이 웹뷰 주소에 싣는 `liveActivity=1`로 판정한다.
 * 원격 웹은 구버전 앱에도 바로 배포되어 표시 없는 앱에는 보내지 않는다.
 * 셸이 없는 브라우저는 받을 곳이 없으므로 거짓이다.
 */
export function hasLiveActivity(): boolean {
  if (!isNativeBridgeAvailable()) {
    return false;
  }
  liveActivityFlagCache ??= readLiveActivityFlag();
  return liveActivityFlagCache;
}

/**
 * 테스트용 잠금화면 표시 판정 초기화
 *
 * 테스트마다 URL을 바꿔 판정하도록 캐시를 비운다.
 */
export function __resetLiveActivityForTests(): void {
  liveActivityFlagCache = null;
}
