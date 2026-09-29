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
 * 1. 무거운 wasm/JS 번들이 첫 화면 로드에 끼지 않는다. 홈은 통계를 그린 뒤 유휴 시간에만 이
 *    청크와 자원을 미리 받고(`./prefetchVisionAssets.ts`), 기록·설정 화면은 받지 않는다.
 * 2. 워커인 `./visionWorker.ts`도 이 파일의 `openObjectDetector`로 검출기를 연다.
 *    그래서 메인 스레드와 워커가 같은 옵션·같은 파일 규칙을 쓴다.
 * 3. 검출 규칙·프레임 루프 테스트가 MediaPipe 설치 없이 돈다 — 그쪽은 이 파일에 닿지 않는다.
 *
 * `FilesetResolver`는 wasm 런타임을 받아오는 무거운 작업이라 한 번만 하고 재사용한다.
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

/**
 * 세션이 받을 로더 JS·wasm 경로
 *
 * 홈의 prefetch(`./prefetchVisionAssets.ts`)가 쓴다.
 *
 * 라이브러리가 SIMD 지원 여부로 파일 이름을 고르므로 경로를 직접 적지 않고 세션과 같은
 * `resolveFileset`에 묻는다. 그래야 prefetch한 파일과 세션이 요청하는 파일이 같은 캐시 항목이 된다.
 * 경로만 계산한다.
 */
export async function resolveVisionAssetUrls(
  wasmPath: string,
): Promise<{ wasmLoaderPath: string; wasmBinaryPath: string }> {
  const { wasmLoaderPath, wasmBinaryPath } = await resolveFileset(wasmPath);
  return { wasmLoaderPath, wasmBinaryPath };
}

/**
 * 옵션에 맞춘 `ObjectDetector` 생성
 *
 * 메인 스레드 런타임과 워커인 `./visionWorker.ts`가 같이 쓴다.
 */
export async function openObjectDetector(options: DetectorCreateOptions): Promise<ObjectDetector> {
  const fileset = await resolveFileset(options.wasmPath);
  // `.tflite` 안의 박스 디코딩·NMS를 라이브러리가 처리하므로 변환도 후처리 구현도 없다(설계 §2).
  return await ObjectDetector.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: options.modelAssetPath,
      delegate: options.delegate,
    },
    runningMode: "VIDEO",
    // COCO 80클래스 중 필요한 둘만 남긴다.
    // 나머지는 후처리 비용일 뿐이다(설계 §2).
    categoryAllowlist: [...options.categoryAllowlist],
    scoreThreshold: options.scoreThreshold,
  });
}

/**
 * 메인 스레드 런타임
 *
 * 워커를 못 쓰는 환경과 `VITE_VISION_WORKER=off` 빌드가 쓴다.
 */
export function createMediapipeRuntime(): MediapipeVisionRuntime {
  return {
    async createDetector(options: DetectorCreateOptions): Promise<MediapipeDetectorHandle> {
      const detector = await openObjectDetector(options);
      return {
        runtime: "main",
        assetTimings: [],
        // 메인 스레드에서 동기로 돈다.
        // 워커 경로와 같은 모양으로 맞추려고 Promise로 감싼다.
        detect: async (video, timestampMs) => detector.detectForVideo(video, timestampMs),
        close: () => detector.close(),
      };
    },
  };
}
