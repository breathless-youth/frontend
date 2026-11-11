// 앱 안에서 이동하면 주소에서 쿼리가 빠지므로 모듈을 불러올 때 한 번 읽어 기억한다.
function readPointsFlag(): boolean {
  return new URLSearchParams(window.location.search).get("points") === "1";
}

let pointsFlagCache: boolean | null = readPointsFlag();

/**
 * 포인트 상점을 여는지
 *
 * 서버 API와 결제가 붙기 전이라 주소에 `points=1`을 단 문서와 개발 서버에서만 연다.
 * `MODE`도 보는 것은 vitest에서도 `DEV`가 참이라 꺼진 경우를 테스트할 수 없어서다.
 * `DEV`도 보는 것은 `vite build --mode development`처럼 `MODE`만 development인 배포 빌드에서 모든 사용자에게 켜지지 않게 하려는 것이다.
 */
export function isPointsEnabled(): boolean {
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
