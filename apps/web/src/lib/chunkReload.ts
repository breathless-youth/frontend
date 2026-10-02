/**
 * 새로고침 뒤에도 다시 실패하면 멈추는 기준 시간
 *
 * 새 문서가 뜨고 청크를 받는 데 충분한 여유다.
 */
export const RELOAD_GUARD_MS = 10_000;

export const RELOAD_AT_KEY = "focusmakers:chunk-reload-at";

/**
 * 청크 로드 실패 뒤 한 번 새로고침
 *
 * 배포가 바뀌면 열려 있던 화면이 지워진 해시 청크를 요청하고, `vercel.json`이 모든 경로를 `index.html`로 돌려 동적 import가 실패한다.
 * 한 번 새로고침해 새 배포의 엔트리를 받는다.
 * 새로고침 시각을 `sessionStorage`에 남겨, 10초 안에 또 실패하면 새로고침하지 않고 `false`를 돌려준다.
 * 저장소를 쓸 수 없으면 반복을 막을 방법이 없어 새로고침하지 않는다.
 */
export function reloadOnceAfterChunkError(
  reload: () => void = () => window.location.reload(),
): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_AT_KEY) ?? 0);
    if (Date.now() - last < RELOAD_GUARD_MS) {
      return false;
    }
    sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()));
  } catch {
    return false;
  }
  reload();
  return true;
}

/**
 * lazy 라우트 로더의 청크 실패 처리
 *
 * 로더가 실패하면 `reloadOnceAfterChunkError`로 새로고침을 시도한다.
 * 새로고침하면 끝나지 않는 promise를 돌려, 새 문서가 뜨기 전까지 `ErrorFallback`이 비치거나 Sentry에 오류가 가지 않게 한다.
 * 새로고침하지 않으면 원래 오류를 던져 `ErrorFallback`이 받게 한다.
 * 미리 받기와 SDK·검출기 import는 이 경로를 타지 않아 실패해도 새로고침하지 않는다.
 */
export function reloadOnChunkError<T>(
  load: () => Promise<T>,
  reload?: () => void,
): () => Promise<T> {
  return () =>
    load().catch((error: unknown) => {
      if (reloadOnceAfterChunkError(reload)) {
        return new Promise<T>(() => {});
      }
      throw error;
    });
}
