/**
 * iOS WKWebView 자동재생 방어 — 동적으로 마운트된 `<video>`는 `autoplay` 속성만으로는
 * 재생이 시작되지 않은 채 남을 수 있다(WebKit이 autoplay를 페이지 로드 시점 요소에만
 * 평가하는 동작 + MediaStream 자동재생 회귀들, 예: WebKit #230922). 그 상태로는 타일이
 * 검게/빈 채 남고, 회전 같은 리레이아웃이 재생 재평가를 트리거해야 살아난다 — 3기기
 * 동시 입장 실기기에서 확인한 증상이다(2026-08-26: 본인+참가자 1명 영상이 안 보이다가
 * 가로 회전 시 복구).
 *
 * srcObject를 붙인 뒤 **매 렌더 호출해도 안전하다** — 이미 재생 중이면 무동작이고,
 * 정책 거부(저전력 모드 등)는 삼켜 다음 렌더에서 자연 재시도된다(세션 화면은 타이머
 * 틱으로 초 단위 재렌더가 있어 별도 재시도 타이머가 필요 없다).
 */
export function kickVideoPlayback(video: HTMLVideoElement): void {
  if (video.srcObject === null || !video.paused) {
    return;
  }
  // jsdom은 play()가 Promise를 돌려주지 않으므로 Promise일 때만 실패를 잡는다.
  const result: unknown = video.play();
  if (result instanceof Promise) {
    result.catch(() => undefined);
  }
}
