/**
 * `requestIdleCallback`이 없을 때 미루는 시간
 *
 * 첫 화면 직후의 입력을 방해하지 않을 여유다.
 */
export const IDLE_FALLBACK_MS = 1_500;

/**
 * 유휴 구간이 오지 않을 때 기다리는 최대 시간
 *
 * 메인 스레드 검출기처럼 쉬지 않고 도는 작업이 있으면 유휴 콜백이 끝내 안 불릴 수 있다.
 */
export const IDLE_TIMEOUT_MS = 3_000;

/**
 * 유휴 시간 실행
 *
 * 첫 화면에 필요 없는 작업을 브라우저가 한가할 때로 미룬다.
 * 한가한 때가 3초 안에 오지 않으면 그때 실행한다.
 * `requestIdleCallback`이 없는 엔진(iOS WKWebView)에서는 1.5초 뒤에 실행한다.
 */
export function whenIdle(task: () => void): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => task(), { timeout: IDLE_TIMEOUT_MS });
  } else {
    setTimeout(task, IDLE_FALLBACK_MS);
  }
}
