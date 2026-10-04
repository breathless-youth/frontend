import type { MediapipeVisionRuntime } from "./mediapipePort";

/**
 * 객체 검출 래퍼와 얼굴 래퍼가 함께 쓰는 런타임 로더
 *
 * 두 래퍼가 각자 런타임을 만들면 워커가 둘 뜨고 wasm 런타임도 두 벌 올라간다.
 * 그래서 런타임 하나를 모듈에 들고 있다가 둘 다에게 같은 것을 준다.
 * 워커는 런타임이 아니라 핸들 수로 수명을 정하므로(`./workerRuntime.ts`) 런타임을 세션 너머로 들고 있어도 워커는 남지 않는다.
 */

async function loadMainRuntime(): Promise<MediapipeVisionRuntime> {
  // 정적 import가 아니라 동적 import인 것이 핵심이다 — `./objectDetector.ts` 주석의 격리 2층.
  const module = await import("./mediapipeModule");
  return module.createMediapipeRuntime();
}

/**
 * 워커 우선 런타임
 *
 * 워커를 쓸 수 있으면 워커를 먼저 쓰고 안 되면 메인 스레드로 넘어간다.
 * `VITE_VISION_WORKER=off`로 만든 측정용 전 빌드와 Worker가 없는 환경은 처음부터 메인 스레드를 쓴다.
 * 워커 모듈도 동적으로 불러 첫 화면 청크에 끼지 않게 한다.
 */
async function createVisionRuntime(): Promise<MediapipeVisionRuntime> {
  if (import.meta.env.VITE_VISION_WORKER === "off" || typeof Worker === "undefined") {
    return await loadMainRuntime();
  }
  const { createFallbackRuntime, createWorkerRuntime } = await import("./workerRuntime");
  return createFallbackRuntime(createWorkerRuntime(), loadMainRuntime);
}

let runtimePromise: Promise<MediapipeVisionRuntime> | null = null;

export function loadVisionRuntime(): Promise<MediapipeVisionRuntime> {
  // 실패하면 비운다. 실패한 promise를 들고 있으면 래퍼의 1회 재시도가 같은 실패를 그대로 받는다.
  runtimePromise ??= createVisionRuntime().catch((error: unknown) => {
    runtimePromise = null;
    throw error;
  });
  return runtimePromise;
}
