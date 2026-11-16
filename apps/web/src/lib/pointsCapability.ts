// 앱 안에서 이동하면 주소에서 쿼리가 빠지므로 모듈을 불러올 때 한 번 읽어 기억한다.
function readPointsFlag(): boolean {
  return new URLSearchParams(window.location.search).get("points") === "1";
}

let pointsFlagCache: boolean | null = readPointsFlag();

/**
 * 포인트 상점을 여는지
 *
 * 포인트 브리지를 아는 앱이 웹뷰 주소에 `points=1`을 붙였을 때와 개발 서버에서만 연다(`apps/mobile/lib/remoteQueryParams.ts`).
 * 원격 웹은 예전 앱과 브라우저에도 바로 배포되므로 표시가 없으면 포인트를 모르는 곳으로 보고 화면과 입구를 모두 숨긴다.
 * `VITE_POINTS_DISABLED=1`로 빌드하면 표시가 있어도 꺼져서, 문제가 생기면 앱을 다시 내지 않고 웹 배포만으로 전체를 끈다.
 * `MODE`도 보는 것은 vitest에서도 `DEV`가 참이라 꺼진 경우를 테스트할 수 없어서다.
 * `DEV`도 보는 것은 `vite build --mode development`처럼 `MODE`만 development인 배포 빌드에서 모든 사용자에게 켜지지 않게 하려는 것이다.
 */
export function isPointsEnabled(): boolean {
  if (import.meta.env.VITE_POINTS_DISABLED === "1") {
    return false;
  }
  if (import.meta.env.DEV && import.meta.env.MODE === "development") {
    return true;
  }
  pointsFlagCache ??= readPointsFlag();
  return pointsFlagCache;
}

/**
 * 테스트용 포인트 상점 판정 초기화
 *
 * 테스트마다 주소를 바꿔 판정하도록 기억한 값을 비운다.
 */
export function __resetPointsForTests(): void {
  pointsFlagCache = null;
}
