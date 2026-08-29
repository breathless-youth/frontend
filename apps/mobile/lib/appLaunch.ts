let pending = true;

/**
 * 앱 프로세스가 시작된 뒤 처음 부를 때만 참이다.
 *
 * 웹뷰가 다시 서거나 문서가 다시 로드되는 것으로는 되살아나지 않아야 한다. 안드로이드 전역
 * 복구는 컴포넌트를 새로 만들지 않고 URL만 다시 만들기 때문에, 마운트 시점에 소비하는 방식은
 * 그 경로를 잡지 못한다. 그래서 모듈 범위에 두고 실제로 보내는 순간에 소비한다.
 */
export function consumeAppLaunchSignal(): boolean {
  if (!pending) {
    return false;
  }
  pending = false;
  return true;
}
