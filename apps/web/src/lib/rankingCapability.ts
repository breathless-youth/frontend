import { isNativeBridgeAvailable } from "./bridge";

// 앱 안 이동은 URL에서 쿼리를 지우므로 모듈을 읽는 시점에 한 번 판정해 보관한다.
// 표시는 바이너리마다 고정이라 다시 읽을 이유가 없다.
function readRankingFlag(): boolean {
  return new URLSearchParams(window.location.search).get("ranking") === "1";
}

let rankingFlagCache: boolean | null = readRankingFlag();

/**
 * 랭킹 탭으로 보낼 수 있는지
 *
 * 셸이 웹뷰 주소에 싣는 `ranking=1`로 가른다.
 * 셸이 없는 브라우저는 웹 라우트로 바로 열 수 있어 참이다.
 */
export function hasRankingTab(): boolean {
  if (!isNativeBridgeAvailable()) {
    return true;
  }
  rankingFlagCache ??= readRankingFlag();
  return rankingFlagCache;
}

/**
 * 테스트용 랭킹 탭 판정 초기화
 *
 * 테스트마다 URL을 바꿔 판정하도록 캐시를 비운다.
 */
export function __resetRankingTabForTests(): void {
  rankingFlagCache = null;
}
