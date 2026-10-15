import type { PhotoSpec } from "@/features/timelapse/photoFrame";

import type {
  AssetTiming,
  DetectorCreateOptions,
  FaceLandmarkerCreateOptions,
  MediapipeDetectionResult,
  MediapipeDetectorHandle,
  MediapipeFaceInference,
  MediapipeFaceLandmarkerHandle,
  MediapipeInferenceHandle,
  MediapipeVisionRuntime,
  VisionRuntimeKind,
} from "./mediapipePort";
import { type MainToWorkerMessage, reasonOf, type WorkerToMainMessage } from "./workerProtocol";

/**
 * Vision 추론을 워커에서 돌리는 런타임
 *
 * `MediapipeVisionRuntime`을 그대로 구현하므로 래퍼·프레임 루프·판정 규칙은 워커를 모른다.
 * 메인 스레드는 `createImageBitmap(video)`로 프레임을 떠서 복사 없이 소유권째 넘기고 답을 기다리기만 한다.
 * 모델 생성과 추론은 `./visionWorker.ts`가 한다.
 *
 * 객체 검출기와 얼굴 모델은 워커 하나를 함께 쓴다.
 * 워커를 둘 띄우면 wasm 런타임이 두 벌 올라가 메모리와 로딩 시간이 그만큼 는다.
 * 워커는 열린 핸들 수로 수명을 정한다. 첫 핸들이 열 때 뜨고 마지막 핸들이 닫을 때 끝난다.
 */

/** Worker 중 이 모듈이 쓰는 부분. 테스트는 가짜로 채운다. */
export interface WorkerPort {
  onmessage: ((event: MessageEvent<WorkerToMainMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: MainToWorkerMessage, transfer: Transferable[]): void;
  terminate(): void;
}

/** 프레임을 뜨지 못한 실패. `createFallbackRuntime`은 이 실패일 때만 메인 스레드 모델로 갈아탄다. */
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

type ResultMessage = Extract<WorkerToMainMessage, { type: "result" }>;

/**
 * 워커에 연 모델 하나의 핸들
 *
 * 공개 핸들은 모델 종류에 맞는 메서드만 골라 낸다.
 */
interface WorkerModelHandle<Result> {
  readonly runtime: VisionRuntimeKind;
  detect(video: HTMLVideoElement, timestampMs: number, photo?: PhotoSpec): Promise<Result>;
  capture(video: HTMLVideoElement, photo: PhotoSpec): Promise<ArrayBuffer>;
  close(): void;
}

type Pending =
  | {
      readonly kind: "create";
      resolve(assetTimings: readonly AssetTiming[]): void;
      reject(error: Error): void;
    }
  | {
      readonly kind: "detect";
      accept(message: ResultMessage): void;
      reject(error: Error): void;
    }
  | {
      readonly kind: "capture";
      resolve(photo: ArrayBuffer): void;
      reject(error: Error): void;
    };

/** 떠 있는 워커 하나와 그 워커에 걸린 요청들. */
interface WorkerSlot {
  readonly worker: WorkerPort;
  /** 이 워커를 쓰는 핸들 수. 생성 중인 것도 센다. */
  refs: number;
  /**
   * 워커가 끝난 이유.
   *
   * null이 아니면 이후 요청은 워커에 보내지 않고 이 이유로 바로 실패한다.
   * 죽은 워커에 보내면 답이 오지 않아 프레임 루프가 `busy`인 채로 멈춘다.
   * 이유를 남기는 것은 연속 실패 뒤 래퍼가 Sentry에 올릴 오류가 무엇이 죽였는지 말하게 하려는 것이다.
   */
  deadReason: string | null;
  nextId: number;
  readonly pending: Map<number, Pending>;
}

export function createWorkerRuntime(deps: WorkerRuntimeDeps = {}): MediapipeVisionRuntime {
  const {
    createWorker = createVisionWorker,
    captureFrame = (video: HTMLVideoElement) => createImageBitmap(video),
    timeOrigin = performance.timeOrigin,
  } = deps;

  /** 새 핸들이 붙을 워커. 죽었거나 모든 핸들이 떠났으면 다음 핸들이 새로 띄운다. */
  let current: WorkerSlot | null = null;

  function kill(slot: WorkerSlot, reason: string): void {
    if (slot.deadReason !== null) {
      return;
    }
    slot.deadReason = reason;
    slot.worker.terminate();
    const waiting = [...slot.pending.values()];
    slot.pending.clear();
    for (const entry of waiting) {
      entry.reject(new Error(reason));
    }
    if (current === slot) {
      current = null;
    }
  }

  function spawn(): WorkerSlot {
    const slot: WorkerSlot = {
      worker: createWorker(),
      refs: 0,
      deadReason: null,
      nextId: 1,
      pending: new Map(),
    };
    slot.worker.onmessage = ({ data }) => {
      const entry = slot.pending.get(data.id);
      if (entry === undefined) {
        // 기다리던 쪽이 이미 떠났다(워커가 죽어 먼저 거절했다).
        return;
      }
      slot.pending.delete(data.id);
      switch (data.type) {
        case "created":
          if (entry.kind === "create") {
            entry.resolve(toDocumentTimings(data.assetTimings, timeOrigin));
          }
          return;
        case "createFailed":
        case "detectFailed":
        case "captureFailed":
          entry.reject(new Error(data.reason));
          return;
        case "result":
          if (entry.kind === "detect") {
            entry.accept(data);
          }
          return;
        case "captured":
          if (entry.kind === "capture") {
            entry.resolve(data.photo);
          }
          return;
      }
    };
    slot.worker.onerror = (event) => {
      // 구형 엔진이라 모듈을 못 불러왔거나 워커 안에서 잡히지 않은 오류가 났다.
      // 취소하지 않으면 같은 오류가 페이지 전역으로 다시 보고돼 Sentry에 올라가므로, 이유는 `deadReason`과 reject로만 남긴다.
      event.preventDefault();
      kill(slot, `워커 오류: ${event.message || "스크립트를 불러오지 못했다"}`);
    };
    return slot;
  }

  function acquire(): WorkerSlot {
    current ??= spawn();
    current.refs += 1;
    return current;
  }

  function release(slot: WorkerSlot): void {
    slot.refs -= 1;
    if (slot.refs === 0) {
      kill(slot, "워커가 닫혔다");
    }
  }

  /**
   * 워커에 모델 하나를 열고 그 핸들을 만든다.
   *
   * `pick`은 답이 이 모델의 것인지 가려 결과를 꺼낸다. 아니면 undefined를 돌려준다.
   */
  async function open<Result>(
    send: (id: number) => MainToWorkerMessage,
    pick: (message: ResultMessage) => Result | undefined,
  ): Promise<{ handle: WorkerModelHandle<Result>; assetTimings: readonly AssetTiming[] }> {
    const slot = acquire();
    const handleId = slot.nextId++;
    let assetTimings: readonly AssetTiming[];
    try {
      assetTimings = await new Promise<readonly AssetTiming[]>((resolve, reject) => {
        slot.pending.set(handleId, {
          kind: "create",
          resolve,
          reject: (error) => reject(new Error(`워커 검출기 생성 실패: ${error.message}`)),
        });
        try {
          slot.worker.postMessage(send(handleId), []);
        } catch (error: unknown) {
          slot.pending.delete(handleId);
          reject(new Error(`워커 검출기 생성 요청 실패: ${reasonOf(error)}`));
        }
      });
    } catch (error: unknown) {
      // 이 모델만 실패했다. 다른 모델이 쓰고 있으면 워커는 남는다.
      release(slot);
      throw error;
    }

    /**
     * 프레임 뜨기부터 답까지, 추론 한 번이 진행 중인가.
     *
     * 일시정지 뒤 재개하면 `frameLoop`의 `busy`가 풀려 앞 추론이 끝나기 전에 새 호출이 올 수 있다.
     * 같은 모델에 두 장을 겹쳐 보내지 않는다. 다른 모델의 추론과는 겹쳐도 된다.
     */
    let inFlight = false;
    /** 이 핸들을 닫은 이유. 워커는 다른 핸들 때문에 살아 있을 수 있다. */
    let closedReason: string | null = null;

    function unusableReason(): string | null {
      return closedReason ?? slot.deadReason;
    }

    /**
     * 프레임을 떠서 소유권째 워커로 넘기고 답을 기다린다.
     *
     * `message`는 새 요청 id와 뜬 프레임으로 보낼 메시지를 만들고, `expect`는 그 답을 받을 자리를 만든다.
     */
    async function sendFrame<Answer>(
      video: HTMLVideoElement,
      message: (id: number, frame: ImageBitmap) => MainToWorkerMessage,
      expect: (resolve: (answer: Answer) => void, reject: (error: Error) => void) => Pending,
    ): Promise<Answer> {
      let frame: ImageBitmap;
      try {
        frame = await captureFrame(video);
      } catch (error: unknown) {
        throw new FrameCaptureError(reasonOf(error));
      }
      const reason = unusableReason();
      if (reason !== null) {
        frame.close();
        throw new Error(reason);
      }
      const id = slot.nextId++;
      return await new Promise<Answer>((resolve, reject) => {
        slot.pending.set(id, expect(resolve, reject));
        try {
          slot.worker.postMessage(message(id, frame), [frame]);
        } catch (error: unknown) {
          // DataCloneError 등으로 보내지 못하면 소유권이 넘어가지 않았으니 여기서 놓는다.
          // `pending`을 비우지 않으면 오지 않을 답이 남는다.
          slot.pending.delete(id);
          frame.close();
          reject(new Error(reasonOf(error)));
        }
      });
    }

    const handle: WorkerModelHandle<Result> = {
      runtime: "worker",
      async detect(video, timestampMs, photo) {
        const reason = unusableReason();
        if (reason !== null) {
          throw new Error(reason);
        }
        if (inFlight) {
          throw new Error("이전 추론이 끝나지 않았다");
        }
        // 첫 await 전에 자리를 잡아야 겹친 호출이 뜨기 도중에 끼어들지 못한다.
        inFlight = true;
        try {
          return await sendFrame<Result>(
            video,
            (id, frame) =>
              // 사진을 찍지 않는 프레임은 지금과 같은 메시지를 보낸다.
              photo === undefined
                ? { type: "detect", id, handleId, frame, timestampMs }
                : { type: "detect", id, handleId, frame, timestampMs, photo },
            (resolve, reject) => ({
              kind: "detect",
              accept(message) {
                const result = pick(message);
                if (result === undefined) {
                  reject(new Error("다른 모델의 답이 왔다"));
                  return;
                }
                resolve(result);
              },
              reject,
            }),
          );
        } finally {
          inFlight = false;
        }
      },
      async capture(video, photo) {
        const reason = unusableReason();
        if (reason !== null) {
          throw new Error(reason);
        }
        return await sendFrame<ArrayBuffer>(
          video,
          (id, frame) => ({ type: "capture", id, frame, photo }),
          (resolve, reject) => ({ kind: "capture", resolve, reject }),
        );
      },
      close() {
        if (closedReason !== null) {
          return;
        }
        closedReason = "워커가 닫혔다";
        if (slot.deadReason === null) {
          try {
            slot.worker.postMessage({ type: "close", handleId }, []);
          } catch {
            // 보내지 못해도 마지막 핸들이면 아래에서 워커째 끝난다.
          }
        }
        release(slot);
      },
    };
    return { handle, assetTimings };
  }

  return {
    async createDetector(options: DetectorCreateOptions): Promise<MediapipeDetectorHandle> {
      const { handle, assetTimings } = await open<MediapipeDetectionResult>(
        (id) => ({ type: "create", id, model: "object", options }),
        (message) => (message.model === "object" ? message.result : undefined),
      );
      return {
        runtime: handle.runtime,
        assetTimings,
        detect: (video, timestampMs) => handle.detect(video, timestampMs),
        capture: (video, photo) => handle.capture(video, photo),
        close: () => handle.close(),
      };
    },

    async createFaceLandmarker(
      options: FaceLandmarkerCreateOptions,
    ): Promise<MediapipeFaceLandmarkerHandle> {
      const { handle } = await open<MediapipeFaceInference>(
        (id) => ({ type: "create", id, model: "face", options }),
        (message) => {
          if (message.model !== "face") {
            return undefined;
          }
          return message.photo === undefined
            ? message.result
            : { ...message.result, photo: message.photo };
        },
      );
      return {
        runtime: handle.runtime,
        detect: (video, timestampMs, photo) => handle.detect(video, timestampMs, photo),
        close: () => handle.close(),
      };
    },
  };
}

/** 추론과 사진 요청이 `run`으로 지금 핸들을 빌려 쓰는 갈아타기 핸들 */
interface FallbackHandle<Handle> {
  readonly runtime: VisionRuntimeKind;
  run<T>(request: (handle: Handle) => Promise<T>): Promise<T>;
  close(): void;
}

/**
 * 워커 핸들을 쓰다가 프레임을 뜨지 못하면 메인 스레드 핸들로 한 번 갈아타는 핸들
 *
 * 갈아타기는 모델마다 따로 일어난다. 객체 검출기가 갈아타도 얼굴 모델은 제 차례에 스스로 갈아탄다.
 * 둘 다 같은 방법으로 프레임을 뜨므로 추론과 사진 요청이 같은 갈아타기를 공유한다.
 */
function withFrameFallback<Handle extends { readonly runtime: VisionRuntimeKind; close(): void }>(
  first: Handle,
  openFallback: () => Promise<Handle>,
): FallbackHandle<Handle> {
  let current = first;
  /**
   * 메인 스레드 핸들로 갈아타는 중이거나 갈아탔다. 모델당 한 번이다.
   * 갈아타기가 실패하면 거절된 채로 남아 이후 추론이 같은 오류로 실패하고, 래퍼가 연속 실패를 보고한다.
   */
  let switched: Promise<Handle> | null = null;
  let closed = false;

  function assertOpen(): void {
    if (closed) {
      // 닫힌 뒤 도착한 추론이 닫힌 MediaPipe 모델을 부르지 않게 한다.
      throw new Error("검출기가 닫혔다");
    }
  }

  return {
    get runtime(): VisionRuntimeKind {
      // 갈아타기를 시작한 순간 워커 핸들은 닫혔다.
      // 메인 생성이 실패해도 워커라고 보고하지 않는다.
      return switched === null ? current.runtime : "main";
    },
    async run(request) {
      assertOpen();
      if (switched === null) {
        try {
          return await request(current);
        } catch (error: unknown) {
          // 닫힌 뒤 뜨기가 실패했으면 이미 떠난 세션이라 메인 모델을 새로 만들지 않는다.
          if (!(error instanceof FrameCaptureError) || closed) {
            throw error;
          }
          console.warn("[vision] 프레임을 워커로 넘기지 못해 메인 스레드로 갈아탄다", error);
          current.close();
          switched = openFallback().then((opened) => {
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
      return await request(opened);
    },
    close() {
      closed = true;
      current.close();
    },
  };
}

/**
 * 워커를 먼저 쓰고 안 되면 메인 스레드로 넘어가는 런타임
 *
 * OffscreenCanvas나 모듈 워커가 없는 엔진에서 워커 모델 생성이 실패하면 그 자리에서 메인 스레드로 만든다.
 * 쓰는 도중 `FrameCaptureError`로 프레임을 뜨지 못하면 메인 스레드 모델로 한 번 갈아탄다.
 * iOS에서 `createImageBitmap(video)` 지원을 확정하지 못해 둔 것이다.
 * 메인 스레드마저 실패하면 그 오류를 그대로 throw해 래퍼가 기존 규칙대로 보고한다.
 */
export function createFallbackRuntime(
  primary: MediapipeVisionRuntime,
  loadFallback: () => Promise<MediapipeVisionRuntime>,
): MediapipeVisionRuntime {
  async function openWithFallback<Handle extends MediapipeInferenceHandle<unknown>>(
    openOn: (runtime: MediapipeVisionRuntime) => Promise<Handle>,
  ): Promise<Handle> {
    try {
      return await openOn(primary);
    } catch (error: unknown) {
      console.warn("[vision] 워커 모델을 만들지 못해 메인 스레드에서 돌린다", error);
      return await openOn(await loadFallback());
    }
  }

  return {
    async createDetector(options) {
      const first = await openWithFallback((runtime) => runtime.createDetector(options));
      // 자원 시각은 준비 때 한 번 읽는다. 갈아탄 뒤에도 워커가 받았던 기록이 그대로 맞다.
      const { assetTimings } = first;
      const handle = withFrameFallback(first, async () =>
        (await loadFallback()).createDetector(options),
      );
      return {
        get runtime() {
          return handle.runtime;
        },
        assetTimings,
        detect: (video, timestampMs) => handle.run((current) => current.detect(video, timestampMs)),
        capture: (video, photo) => handle.run((current) => current.capture(video, photo)),
        close: () => handle.close(),
      };
    },

    async createFaceLandmarker(options) {
      const first = await openWithFallback((runtime) => runtime.createFaceLandmarker(options));
      const handle = withFrameFallback(first, async () =>
        (await loadFallback()).createFaceLandmarker(options),
      );
      return {
        get runtime() {
          return handle.runtime;
        },
        detect: (video, timestampMs, photo) =>
          handle.run((current) => current.detect(video, timestampMs, photo)),
        close: () => handle.close(),
      };
    },
  };
}
