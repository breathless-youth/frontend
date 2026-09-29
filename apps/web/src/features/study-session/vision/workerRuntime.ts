import type {
  AssetTiming,
  DetectorCreateOptions,
  MediapipeDetectionResult,
  MediapipeDetectorHandle,
  MediapipeVisionRuntime,
} from "./objectDetector";
import { type MainToWorkerMessage, reasonOf, type WorkerToMainMessage } from "./workerProtocol";

/**
 * Vision 추론을 워커에서 돌리는 런타임
 *
 * `MediapipeVisionRuntime`을 그대로 구현하므로 `objectDetector.ts`·프레임 루프·판정 규칙은 워커를 모른다.
 * 메인 스레드는 `createImageBitmap(video)`로 프레임을 떠서 복사 없이 소유권째 넘기고 답을 기다리기만 한다.
 * 검출기 생성과 추론은 `./visionWorker.ts`가 한다.
 */

/** Worker 중 이 모듈이 쓰는 부분. 테스트는 가짜로 채운다. */
export interface WorkerPort {
  onmessage: ((event: MessageEvent<WorkerToMainMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: MainToWorkerMessage, transfer: Transferable[]): void;
  terminate(): void;
}

/** 프레임을 뜨지 못한 실패. `createFallbackRuntime`은 이 실패일 때만 메인 스레드 검출기로 갈아탄다. */
export class FrameCaptureError extends Error {
  override readonly name = "FrameCaptureError";
}

export interface WorkerRuntimeDeps {
  readonly createWorker?: () => WorkerPort;
  readonly captureFrame?: (video: HTMLVideoElement) => Promise<ImageBitmap>;
  /** 문서의 `performance.timeOrigin`. 워커가 보낸 epoch 시각을 문서 시각으로 바꿀 때 쓴다. */
  readonly timeOrigin?: number;
}

function createVisionWorker(): WorkerPort {
  // Vite는 `new Worker(new URL(<문자열>, import.meta.url))` 모양을 보고 워커를 따로 묶는다.
  // 경로를 변수로 빼면 인식하지 못한다.
  return new Worker(new URL("./visionWorker.ts", import.meta.url), { type: "module" });
}

/**
 * 워커가 보낸 자원 시각의 문서 시각 변환
 *
 * 워커는 epoch ms로 보내고, 문서 시각은 `performance.now()` 기준이다.
 */
export function toDocumentTimings(
  timings: readonly AssetTiming[],
  timeOrigin: number,
): AssetTiming[] {
  return timings.map((timing) => ({ ...timing, startTime: timing.startTime - timeOrigin }));
}

interface PendingDetect {
  resolve(result: MediapipeDetectionResult): void;
  reject(error: Error): void;
}

export function createWorkerRuntime(deps: WorkerRuntimeDeps = {}): MediapipeVisionRuntime {
  const {
    createWorker = createVisionWorker,
    captureFrame = (video: HTMLVideoElement) => createImageBitmap(video),
    timeOrigin = performance.timeOrigin,
  } = deps;

  return {
    createDetector(options: DetectorCreateOptions): Promise<MediapipeDetectorHandle> {
      return new Promise((resolve, reject) => {
        const worker = createWorker();
        /** 워커의 답을 기다리는 추론. 답에는 짝지을 id가 없으므로 한 번에 하나만 보낸다. */
        let pending: PendingDetect | null = null;
        /**
         * 프레임 뜨기부터 답까지, 추론 한 번이 진행 중인가.
         *
         * `pending`은 프레임을 뜬 뒤에야 채워지므로, 그것만 보면 뜨는 도중 들어온 두 번째 호출이 통과해 앞 추론의 `pending`을 덮어쓴다.
         * 일시정지 뒤 재개하면 `frameLoop`의 `busy`가 풀려 앞 추론이 끝나기 전에 새 호출이 올 수 있다.
         */
        let inFlight = false;
        /**
         * 닫혔거나 워커가 죽은 이유.
         *
         * null이 아니면 이후 추론은 워커에 보내지 않고 이 이유로 바로 실패한다.
         * 죽은 워커에 보내면 답이 오지 않아 프레임 루프가 `busy`인 채로 멈춘다.
         * 이유를 남기는 것은 연속 실패 뒤 `objectDetector.ts`가 Sentry에 올릴 오류가 무엇이 죽였는지 말하게 하려는 것이다.
         */
        let deadReason: string | null = null;

        function takePending(): PendingDetect | null {
          const current = pending;
          pending = null;
          return current;
        }

        function shutdown(reason: string): void {
          deadReason = reason;
          worker.terminate();
          // 생성 전이면 생성 실패, 생성 뒤면 기다리던 추론의 실패가 된다.
          // 이미 끝난 Promise의 reject는 효과가 없다.
          reject(new Error(reason));
          takePending()?.reject(new Error(reason));
        }

        async function sendFrame(
          video: HTMLVideoElement,
          timestampMs: number,
        ): Promise<MediapipeDetectionResult> {
          let frame: ImageBitmap;
          try {
            frame = await captureFrame(video);
          } catch (error: unknown) {
            throw new FrameCaptureError(reasonOf(error));
          }
          if (deadReason !== null) {
            frame.close();
            throw new Error(deadReason);
          }
          return await new Promise<MediapipeDetectionResult>((resolveDetect, rejectDetect) => {
            pending = { resolve: resolveDetect, reject: rejectDetect };
            try {
              worker.postMessage({ type: "detect", frame, timestampMs }, [frame]);
            } catch (error: unknown) {
              // DataCloneError 등으로 보내지 못하면 소유권이 넘어가지 않았으니 여기서 놓는다.
              // `pending`을 비우지 않으면 오지 않을 답을 기다리느라 이후 추론이 전부 막힌다.
              pending = null;
              frame.close();
              rejectDetect(new Error(reasonOf(error)));
            }
          });
        }

        function makeHandle(assetTimings: readonly AssetTiming[]): MediapipeDetectorHandle {
          return {
            runtime: "worker",
            assetTimings,
            async detect(video, timestampMs) {
              if (deadReason !== null) {
                throw new Error(deadReason);
              }
              if (inFlight) {
                throw new Error("이전 추론이 끝나지 않았다");
              }
              // 첫 await 전에 자리를 잡아야 겹친 호출이 뜨기 도중에 끼어들지 못한다.
              inFlight = true;
              try {
                return await sendFrame(video, timestampMs);
              } finally {
                inFlight = false;
              }
            },
            close() {
              if (deadReason === null) {
                shutdown("워커가 닫혔다");
              }
            },
          };
        }

        worker.onmessage = ({ data }) => {
          switch (data.type) {
            case "created":
              resolve(makeHandle(toDocumentTimings(data.assetTimings, timeOrigin)));
              return;
            case "createFailed":
              shutdown(`워커 검출기 생성 실패: ${data.reason}`);
              return;
            case "result":
              takePending()?.resolve(data.result);
              return;
            case "detectFailed":
              takePending()?.reject(new Error(data.reason));
              return;
          }
        };
        worker.onerror = (event) => {
          // 구형 엔진이라 모듈을 못 불러왔거나 워커 안에서 잡히지 않은 오류가 났다.
          shutdown(`워커 오류: ${event.message || "스크립트를 불러오지 못했다"}`);
        };
        try {
          worker.postMessage({ type: "create", options }, []);
        } catch (error: unknown) {
          // 여기서 throw하면 Promise는 거절되지만 워커는 떠 있는 채로 남는다.
          // 끝내고 실패시킨다.
          shutdown(`워커 검출기 생성 요청 실패: ${reasonOf(error)}`);
        }
      });
    },
  };
}

/**
 * 워커를 먼저 쓰고 안 되면 메인 스레드로 넘어가는 런타임
 *
 * OffscreenCanvas나 모듈 워커가 없는 엔진에서 워커 검출기 생성이 실패하면 그 자리에서 메인 스레드로 만든다.
 * 쓰는 도중 `FrameCaptureError`로 프레임을 뜨지 못하면 메인 스레드 검출기로 한 번 갈아탄다.
 * iOS에서 `createImageBitmap(video)` 지원을 확정하지 못해 둔 것이다.
 * 메인 스레드마저 실패하면 그 오류를 그대로 throw해 `objectDetector.ts`가 기존 규칙대로 보고한다.
 */
export function createFallbackRuntime(
  primary: MediapipeVisionRuntime,
  loadFallback: () => Promise<MediapipeVisionRuntime>,
): MediapipeVisionRuntime {
  async function openFallback(options: DetectorCreateOptions): Promise<MediapipeDetectorHandle> {
    const runtime = await loadFallback();
    return await runtime.createDetector(options);
  }

  return {
    async createDetector(options) {
      let current: MediapipeDetectorHandle;
      try {
        current = await primary.createDetector(options);
      } catch (error: unknown) {
        console.warn("[vision] 워커 검출기를 만들지 못해 메인 스레드에서 돌린다", error);
        return await openFallback(options);
      }
      const { assetTimings } = current;
      /**
       * 메인 스레드 검출기로 갈아타는 중이거나 갈아탔다. 세션당 한 번이다.
       * 갈아타기가 실패하면 거절된 채로 남아 이후 추론이 같은 오류로 실패하고, `objectDetector.ts`가 연속 실패를 보고한다.
       */
      let switched: Promise<MediapipeDetectorHandle> | null = null;
      let closed = false;

      function assertOpen(): void {
        if (closed) {
          // 닫힌 뒤 도착한 추론이 닫힌 MediaPipe 검출기를 부르지 않게 한다.
          throw new Error("검출기가 닫혔다");
        }
      }

      return {
        get runtime() {
          // 갈아타기를 시작한 순간 워커는 닫혔다.
          // 메인 생성이 실패해도 워커라고 보고하지 않는다.
          return switched === null ? current.runtime : "main";
        },
        assetTimings,
        async detect(video, timestampMs) {
          assertOpen();
          if (switched === null) {
            try {
              return await current.detect(video, timestampMs);
            } catch (error: unknown) {
              // 닫힌 뒤 뜨기가 실패했으면 이미 떠난 세션이라 메인 검출기를 새로 만들지 않는다.
              if (!(error instanceof FrameCaptureError) || closed) {
                throw error;
              }
              console.warn("[vision] 프레임을 워커로 넘기지 못해 메인 스레드로 갈아탄다", error);
              current.close();
              switched = openFallback(options).then((opened) => {
                if (closed) {
                  opened.close();
                } else {
                  current = opened;
                }
                return opened;
              });
            }
          }
          const opened = await switched;
          assertOpen();
          return await opened.detect(video, timestampMs);
        },
        close() {
          closed = true;
          current.close();
        },
      };
    },
  };
}
