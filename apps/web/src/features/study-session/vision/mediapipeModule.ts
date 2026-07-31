import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";

import type {
  DetectorCreateOptions,
  MediapipeDetectorHandle,
  MediapipeVisionRuntime,
} from "./objectDetector";

/**
 * `@mediapipe/tasks-vision`을 **실제로 import하는 유일한 파일**.
 *
 * `objectDetector.ts`가 이 모듈을 동적으로만 부르기 때문에 세 가지가 따라온다.
 *
 * 1. **무거운 wasm/JS 번들이 세션에 들어갈 때까지 로드되지 않는다.** 홈·기록·설정 화면은
 *    이 청크를 받지 않는다.
 * 2. **워커 이전(설계 §3)의 교체 대상이 이 파일 하나로 좁혀진다.** 같은
 *    `MediapipeVisionRuntime`을 구현하는 워커 프록시로 바꾸면 상위 코드는 그대로다.
 * 3. 검출 규칙·프레임 루프 테스트가 MediaPipe 설치 없이 돈다 — 그쪽은 이 파일에 닿지 않는다.
 *
 * `FilesetResolver`는 wasm 런타임을 받아오는 무거운 작업이라 **한 번만 하고 재사용**한다.
 * GPU가 실패해 CPU로 폴백할 때 이걸 다시 받으면 폴백이 두 배로 느려진다.
 */

let filesetPromise: Promise<Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>> | null =
  null;

function resolveFileset(wasmPath: string) {
  // ⚠️ **두 번째 인자(`useModule`)를 넘기지 마라.** `true`를 주면 라이브러리가
  // `vision_wasm_module_internal.*`을 요청하는데, 그 두 파일은 번들에 없다 —
  // `scripts/copyMediapipeWasm.js`가 11.3 MiB 사군살로 판단해 제외한다. 넘기려면 그 제외를
  // 먼저 풀어야 하고, 안 풀면 wasm 404로 감지가 통째로 죽는다.
  // (SIMD/nosimd 분기는 라이브러리가 런타임에 고르며 두 쌍 다 번들에 들어 있다.)
  //
  // 실패하면 캐시를 비운다 — 실패한 promise를 들고 있으면 재시도(설계 §2 폴백·1회 재시도)가
  // 매번 같은 실패를 그대로 되돌려 받는다.
  filesetPromise ??= FilesetResolver.forVisionTasks(wasmPath).catch((error: unknown) => {
    filesetPromise = null;
    throw error;
  });
  return filesetPromise;
}

export function createMediapipeRuntime(): MediapipeVisionRuntime {
  return {
    async createDetector(options: DetectorCreateOptions): Promise<MediapipeDetectorHandle> {
      const fileset = await resolveFileset(options.wasmPath);
      // `.tflite` 안의 박스 디코딩·NMS를 라이브러리가 처리한다 — 변환도 후처리 구현도 없다(설계 §2).
      return await ObjectDetector.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: options.modelAssetPath,
          delegate: options.delegate,
        },
        runningMode: "VIDEO",
        // COCO 80클래스 중 필요한 둘만 남긴다. 나머지는 후처리 비용일 뿐이다(설계 §2).
        categoryAllowlist: [...options.categoryAllowlist],
        scoreThreshold: options.scoreThreshold,
      });
    },
  };
}
