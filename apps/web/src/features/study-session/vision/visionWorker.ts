import type { AssetTiming } from "./mediapipePort";
import { openFaceLandmarker, openObjectDetector } from "./mediapipeModule";
import { createWorkerMessageHandler, type MainToWorkerMessage } from "./workerProtocol";

/**
 * Vision 추론 워커
 *
 * `./workerRuntime.ts`가 모듈 워커로 띄운다. 객체 검출기와 얼굴 모델이 이 워커 하나에 함께 산다.
 * 메시지 처리는 `./workerProtocol.ts`에 있고, 여기는 MediaPipe와 워커 전역을 잇기만 한다.
 */

/**
 * 로더 스크립트를 전역 스코프에서 실행하는 `self.import`
 *
 * MediaPipe 로더는 워커에서 `importScripts`로 로더 스크립트를 부른다.
 * 모듈 워커에서는 그게 TypeError로 실패하고, 그러면 `self.import(url)`이 있으면 그걸 쓴다.
 * 없으면 `import()`로 가는데, 그 경로에 필요한 `vision_wasm_module_internal.*`은 `scripts/copyMediapipeWasm.js`가 번들에서 뺐다.
 * `globalThis.eval`은 간접 호출이라 전역에서 돌고, 로더가 만든 `ModuleFactory`가 전역에 남는다.
 * `fetch`로 받으므로 홈에서 `./prefetchVisionAssets.ts`가 미리 받아 둔 캐시 항목을 그대로 쓴다.
 * 앱에 CSP가 없어 막히지 않는다.
 * CSP를 도입하면 이 워커에 `unsafe-eval`이 필요하다.
 */
(globalThis as typeof globalThis & { import?: (url: string) => Promise<void> }).import = async (
  url,
) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`로더 응답 ${response.status}: ${url}`);
  }
  globalThis.eval(await response.text());
};

const handle = createWorkerMessageHandler({
  createDetector: openObjectDetector,
  createFaceLandmarker: openFaceLandmarker,
  readAssetTimings() {
    // 워커의 `timeOrigin`이 문서와 달라 epoch ms로 바꿔 보낸다.
    // 메인이 문서 시각으로 되돌린다.
    return (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).map(
      (entry): AssetTiming => ({
        name: entry.name,
        startTime: performance.timeOrigin + entry.startTime,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize,
      }),
    );
  },
  post(message) {
    postMessage(message);
  },
});

addEventListener("message", (event: MessageEvent<MainToWorkerMessage>) => {
  void handle(event.data);
});
