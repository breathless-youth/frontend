// 앱 안 이동은 URL에서 쿼리를 지우므로 처음 읽은 값을 보관한다.
// 표시는 바이너리마다 고정이다.
function readTabBarPlayFlag(): boolean {
  return new URLSearchParams(window.location.search).get("tabBarPlay") === "1";
}

let tabBarPlayCache: boolean | null = readTabBarPlayFlag();

/**
 * 앱 탭 바에 과목 없이 공부를 시작하는 재생 버튼이 있는지
 *
 * 그 버튼을 그리는 앱이 웹뷰 URL에 `tabBarPlay=1`을 붙인다.
 * 원격 웹은 버튼이 없는 이전 앱에도 바로 배포되므로 표시가 없으면 홈 안에 시작 버튼을 남긴다.
 */
export function hasTabBarPlayButton(): boolean {
  tabBarPlayCache ??= readTabBarPlayFlag();
  return tabBarPlayCache;
}

/** 테스트마다 URL을 바꿔 판정하도록 캐시를 비운다. */
export function __resetTabBarPlayForTests(): void {
  tabBarPlayCache = null;
}
