import type {
  AssetTiming,
  DetectorCreateOptions,
  MediapipeDetectionResult,
} from "./objectDetector";

/**
 * 메인 스레드와 Vision 워커 사이의 메시지 형식과 워커 쪽 처리
 *
 * 처리 로직을 `./visionWorker.ts` 밖에 두는 이유는 Worker 없이 단위 테스트하기 위해서다.
 * 워커는 이 함수에 MediaPipe와 `postMessage`를 꽂기만 한다.
 * 종료 메시지는 없다.
 * 메인이 `terminate()`하면 wasm 힙과 GL 컨텍스트가 함께 사라진다.
 */

export type MainToWorkerMessage =
  | { readonly type: "create"; readonly options: DetectorCreateOptions }
  /** `frame`은 transfer로 소유권째 넘어온다. 처리 뒤 워커가 닫는다. */
  | { readonly type: "detect"; readonly frame: ImageBitmap; readonly timestampMs: number };

export type WorkerToMainMessage =
  /** `assetTimings[].startTime`은 epoch ms다. 워커와 문서의 `timeOrigin`이 달라 메인이 되돌린다. */
  | { readonly type: "created"; readonly assetTimings: readonly AssetTiming[] }
  | { readonly type: "createFailed"; readonly reason: string }
  | { readonly type: "result"; readonly result: MediapipeDetectionResult }
  | { readonly type: "detectFailed"; readonly reason: string };

/** 워커 안의 검출기. MediaPipe `ObjectDetector`가 그대로 맞는다. */
export interface WorkerDetector {
  detectForVideo(frame: ImageBitmap, timestampMs: number): MediapipeDetectionResult;
  close(): void;
}

export interface WorkerHandlerDeps {
  createDetector(options: DetectorCreateOptions): Promise<WorkerDetector>;
  /** 워커가 지금까지 받은 자원의 Resource Timing. `startTime`은 epoch ms로 준다. */
  readAssetTimings(): readonly AssetTiming[];
  post(message: WorkerToMainMessage): void;
}

export function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createWorkerMessageHandler(
  deps: WorkerHandlerDeps,
): (message: MainToWorkerMessage) => Promise<void> {
  let detector: WorkerDetector | null = null;

  return async (message) => {
    if (message.type === "create") {
      try {
        detector = await deps.createDetector(message.options);
        deps.post({ type: "created", assetTimings: deps.readAssetTimings() });
      } catch (error: unknown) {
        deps.post({ type: "createFailed", reason: reasonOf(error) });
      }
      return;
    }

    try {
      if (detector === null) {
        throw new Error("검출기가 없다");
      }
      deps.post({
        type: "result",
        result: detector.detectForVideo(message.frame, message.timestampMs),
      });
    } catch (error: unknown) {
      deps.post({ type: "detectFailed", reason: reasonOf(error) });
    } finally {
      // 0.5초마다 한 장씩 오므로 GC를 기다리지 않고 바로 놓는다.
      message.frame.close();
    }
  };
}
