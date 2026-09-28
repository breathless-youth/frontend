/**
 * 프라미스에 상한을 씌운다. 네이티브 콜백이 영영 안 돌아오는 경로(Remote Config 활성화, ATT 프롬프트)를
 * 기다리는 쪽이 같이 멎지 않게 하는 용도다 — 호출부는 거부를 잡아 진행 가능한 기본값으로 넘어간다.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
