import type {
  AssetTiming,
  DetectorCreateOptions,
  FaceLandmarkerCreateOptions,
  MediapipeDetectionResult,
  MediapipeFaceResult,
} from "./mediapipePort";

/**
 * 메인 스레드와 Vision 워커 사이의 메시지 형식과 워커 쪽 처리
 *
 * 처리 로직을 `./visionWorker.ts` 밖에 두는 이유는 Worker 없이 단위 테스트하기 위해서다.
 * 워커는 이 함수에 MediaPipe와 `postMessage`를 꽂기만 한다.
 *
 * 워커 하나에 객체 검출기와 얼굴 모델이 함께 산다.
 * 요청마다 `id`를 달아 답을 짝짓고, 생성 요청의 `id`가 그 모델의 `handleId`가 된다.
 * 워커 전체를 끝내는 메시지는 없다.
 * 메인이 `terminate()`하면 wasm 힙과 GL 컨텍스트가 함께 사라진다.
 */

export type WorkerModelKind = "object" | "face";

export type MainToWorkerMessage =
  | {
      readonly type: "create";
      readonly id: number;
      readonly model: "object";
      readonly options: DetectorCreateOptions;
    }
  | {
      readonly type: "create";
      readonly id: number;
      readonly model: "face";
      readonly options: FaceLandmarkerCreateOptions;
    }
  /** `frame`은 transfer로 소유권째 넘어온다. 처리 뒤 워커가 닫는다. */
  | {
      readonly type: "detect";
      readonly id: number;
      readonly handleId: number;
      readonly frame: ImageBitmap;
      readonly timestampMs: number;
    }
  /** 모델 하나만 놓는다. 다른 모델은 계속 돈다. */
  | { readonly type: "close"; readonly handleId: number };

export type WorkerToMainMessage =
  /** `assetTimings[].startTime`은 epoch ms다. 워커와 문서의 `timeOrigin`이 달라 메인이 되돌린다. */
  | {
      readonly type: "created";
      readonly id: number;
      readonly assetTimings: readonly AssetTiming[];
    }
  | { readonly type: "createFailed"; readonly id: number; readonly reason: string }
  | {
      readonly type: "result";
      readonly id: number;
      readonly model: "object";
      readonly result: MediapipeDetectionResult;
    }
  | {
      readonly type: "result";
      readonly id: number;
      readonly model: "face";
      readonly result: MediapipeFaceResult;
    }
  | { readonly type: "detectFailed"; readonly id: number; readonly reason: string };

/** 워커 안의 검출기. MediaPipe `ObjectDetector`가 그대로 맞는다. */
export interface WorkerDetector {
  detectForVideo(frame: ImageBitmap, timestampMs: number): MediapipeDetectionResult;
  close(): void;
}

/** 워커 안의 얼굴 모델. MediaPipe `FaceLandmarker`가 그대로 맞는다. */
export interface WorkerFaceLandmarker {
  detectForVideo(frame: ImageBitmap, timestampMs: number): MediapipeFaceResult;
  close(): void;
}

export interface WorkerHandlerDeps {
  createDetector(options: DetectorCreateOptions): Promise<WorkerDetector>;
  createFaceLandmarker(options: FaceLandmarkerCreateOptions): Promise<WorkerFaceLandmarker>;
  /** 워커가 지금까지 받은 자원의 Resource Timing. `startTime`은 epoch ms로 준다. */
  readAssetTimings(): readonly AssetTiming[];
  post(message: WorkerToMainMessage): void;
}

type WorkerModel =
  | { readonly kind: "object"; readonly model: WorkerDetector }
  | { readonly kind: "face"; readonly model: WorkerFaceLandmarker };

export function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createWorkerMessageHandler(
  deps: WorkerHandlerDeps,
): (message: MainToWorkerMessage) => Promise<void> {
  const models = new Map<number, WorkerModel>();
  /**
   * 만드는 도중에 닫으라고 한 모델.
   *
   * 모델을 받는 데 수백 ms가 걸리므로 그 사이 세션을 나가면 `close`가 `created`보다 먼저 온다.
   * 기억해 두지 않으면 다 만든 모델이 아무도 부르지 않는 채로 워커에 남는다.
   */
  const closedWhileCreating = new Set<number>();
  const creating = new Set<number>();

  async function create(message: Extract<MainToWorkerMessage, { type: "create" }>): Promise<void> {
    creating.add(message.id);
    let opened: WorkerModel;
    try {
      opened =
        message.model === "object"
          ? { kind: "object", model: await deps.createDetector(message.options) }
          : { kind: "face", model: await deps.createFaceLandmarker(message.options) };
    } catch (error: unknown) {
      deps.post({ type: "createFailed", id: message.id, reason: reasonOf(error) });
      return;
    } finally {
      creating.delete(message.id);
    }
    if (closedWhileCreating.delete(message.id)) {
      opened.model.close();
      return;
    }
    models.set(message.id, opened);
    deps.post({ type: "created", id: message.id, assetTimings: deps.readAssetTimings() });
  }

  function detect(message: Extract<MainToWorkerMessage, { type: "detect" }>): void {
    try {
      const entry = models.get(message.handleId);
      if (entry === undefined) {
        throw new Error("검출기가 없다");
      }
      if (entry.kind === "object") {
        deps.post({
          type: "result",
          id: message.id,
          model: "object",
          result: entry.model.detectForVideo(message.frame, message.timestampMs),
        });
      } else {
        deps.post({
          type: "result",
          id: message.id,
          model: "face",
          result: entry.model.detectForVideo(message.frame, message.timestampMs),
        });
      }
    } catch (error: unknown) {
      deps.post({ type: "detectFailed", id: message.id, reason: reasonOf(error) });
    } finally {
      // 프레임마다 한 장씩 오므로 GC를 기다리지 않고 바로 놓는다.
      message.frame.close();
    }
  }

  function close(handleId: number): void {
    const entry = models.get(handleId);
    if (entry !== undefined) {
      models.delete(handleId);
      entry.model.close();
      return;
    }
    if (creating.has(handleId)) {
      closedWhileCreating.add(handleId);
    }
  }

  return async (message) => {
    switch (message.type) {
      case "create":
        await create(message);
        return;
      case "detect":
        detect(message);
        return;
      case "close":
        close(message.handleId);
        return;
    }
  };
}
