import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DetectorCreateOptions,
  FaceLandmarkerCreateOptions,
  MediapipeDetectionResult,
  MediapipeDetectorHandle,
  MediapipeFaceLandmarkerHandle,
  MediapipeFaceResult,
  MediapipeVisionRuntime,
} from "../mediapipePort";
import type { MainToWorkerMessage, WorkerToMainMessage } from "../workerProtocol";
import type { WorkerPort } from "../workerRuntime";
import {
  createFallbackRuntime,
  createWorkerRuntime,
  FrameCaptureError,
  toDocumentTimings,
} from "../workerRuntime";

/** 진짜 Worker 대신 메시지를 기록하고, 테스트가 워커의 답을 직접 흘려 넣는다. */
class FakeWorker implements WorkerPort {
  onmessage: ((event: MessageEvent<WorkerToMainMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly posted: { message: MainToWorkerMessage; transfer: Transferable[] }[] = [];
  terminated = false;
  /** 켜면 detect 전송이 structured clone 단계에서 실패하는 것처럼 throw한다. */
  failDetectPost = false;
  /** 켜면 create 전송이 동기로 throw한다. */
  failCreatePost = false;

  postMessage(message: MainToWorkerMessage, transfer: Transferable[]): void {
    if (this.failDetectPost && message.type === "detect") {
      throw new Error("DataCloneError");
    }
    if (this.failCreatePost && message.type === "create") {
      throw new Error("DataCloneError");
    }
    this.posted.push({ message, transfer });
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(message: WorkerToMainMessage): void {
    this.onmessage?.({ data: message } as MessageEvent<WorkerToMainMessage>);
  }

  /** 마지막으로 보낸 그 종류 메시지의 id. 답을 짝지을 때 쓴다. */
  lastId(type: "create" | "detect" | "capture"): number {
    const found = this.posted.findLast((entry) => entry.message.type === type)?.message;
    if (found === undefined || found.type === "close") {
      throw new Error(`${type}를 보낸 적이 없다`);
    }
    return found.id;
  }

  replyResult(result: MediapipeDetectionResult): void {
    this.reply({ type: "result", id: this.lastId("detect"), model: "object", result });
  }

  crash(message: string): ErrorEvent & { preventDefault: ReturnType<typeof vi.fn> } {
    const event = { message, preventDefault: vi.fn() } as unknown as ErrorEvent & {
      preventDefault: ReturnType<typeof vi.fn>;
    };
    this.onerror?.(event);
    return event;
  }
}

const OPTIONS: DetectorCreateOptions = {
  wasmPath: "/mediapipe/wasm",
  modelAssetPath: "/models/efficientdet_lite0_int8.tflite",
  delegate: "CPU",
  categoryAllowlist: ["person", "cell phone"],
  scoreThreshold: 0.3,
};

const FACE_OPTIONS: FaceLandmarkerCreateOptions = {
  wasmPath: "/mediapipe/wasm",
  modelAssetPath: "/models/face_landmarker-64184e22.task",
  delegate: "CPU",
  numFaces: 1,
  minFaceDetectionConfidence: 0.5,
  minFacePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

const RESULT: MediapipeDetectionResult = {
  detections: [{ categories: [{ categoryName: "person", score: 0.9 }] }],
};

const FACE_RESULT: MediapipeFaceResult = { faceLandmarks: [], faceBlendshapes: [] };

const video = {} as HTMLVideoElement;

function fakeFrame() {
  return { close: vi.fn() } as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };
}

/** 마이크로태스크를 흘려보낸다. 프레임을 뜨는 await 뒤 postMessage가 나가는 시점을 만든다. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setup(
  captureFrame: (video: HTMLVideoElement) => Promise<ImageBitmap> = async () => fakeFrame(),
) {
  const workers: FakeWorker[] = [];
  const runtime = createWorkerRuntime({
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    captureFrame,
    timeOrigin: 1_000,
  });
  return {
    runtime,
    workers,
    /** 가장 최근에 띄운 워커. 아직 없으면 테스트가 잘못 짜인 것이다. */
    get worker(): FakeWorker {
      const latest = workers.at(-1);
      if (latest === undefined) {
        throw new Error("워커를 띄운 적이 없다");
      }
      return latest;
    },
  };
}

async function ready(env: ReturnType<typeof setup>) {
  const creating = env.runtime.createDetector(OPTIONS);
  env.worker.reply({ type: "created", id: env.worker.lastId("create"), assetTimings: [] });
  return await creating;
}

async function readyFace(env: ReturnType<typeof setup>) {
  const creating = env.runtime.createFaceLandmarker(FACE_OPTIONS);
  env.worker.reply({ type: "created", id: env.worker.lastId("create"), assetTimings: [] });
  return await creating;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toDocumentTimings", () => {
  it("워커가 epoch ms로 보낸 시각을 문서 시각으로 되돌린다", () => {
    const timing = {
      name: "https://web.focusmakers.app/models/a.tflite",
      startTime: 1_700_000_005_000,
      transferSize: 1,
      encodedBodySize: 1,
      decodedBodySize: 1,
    };
    expect(toDocumentTimings([timing], 1_700_000_000_000)).toEqual([
      { ...timing, startTime: 5_000 },
    ]);
  });
});

describe("createWorkerRuntime", () => {
  it("옵션을 create로 보내고, created면 워커 핸들을 돌려준다(자원 시각은 문서 시각)", async () => {
    const env = setup();
    const { runtime } = env;

    const creating = runtime.createDetector(OPTIONS);
    const { worker } = env;
    worker.reply({
      type: "created",
      id: 1,
      assetTimings: [
        {
          name: "x.wasm",
          startTime: 1_500,
          transferSize: 0,
          encodedBodySize: 9,
          decodedBodySize: 9,
        },
      ],
    });
    const handle = await creating;

    expect(worker.posted[0]).toEqual({
      message: { type: "create", id: 1, model: "object", options: OPTIONS },
      transfer: [],
    });
    expect(handle.runtime).toBe("worker");
    expect(handle.assetTimings).toEqual([
      { name: "x.wasm", startTime: 500, transferSize: 0, encodedBodySize: 9, decodedBodySize: 9 },
    ]);
  });

  it("createFailed면 워커를 끝내고 생성이 실패한다", async () => {
    const env = setup();

    const creating = env.runtime.createDetector(OPTIONS);
    const { worker } = env;
    worker.reply({ type: "createFailed", id: 1, reason: "document is not defined" });

    await expect(creating).rejects.toThrow("document is not defined");
    expect(worker.terminated).toBe(true);
  });

  it("생성 중 워커 오류(error 이벤트)면 워커를 끝내고 생성이 실패한다", async () => {
    const env = setup();

    const creating = env.runtime.createDetector(OPTIONS);
    const { worker } = env;
    const event = worker.crash("SyntaxError: Cannot use import statement outside a module");

    await expect(creating).rejects.toThrow("SyntaxError");
    expect(worker.terminated).toBe(true);
    // 취소하지 않으면 같은 오류가 페이지의 window.onerror로 다시 올라가 Sentry에 잡힌다.
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("create를 보내다 던지면 워커를 끝내고 생성이 실패한다", async () => {
    const workers: FakeWorker[] = [];
    const runtime = createWorkerRuntime({
      createWorker: () => {
        const worker = new FakeWorker();
        worker.failCreatePost = true;
        workers.push(worker);
        return worker;
      },
    });

    await expect(runtime.createDetector(OPTIONS)).rejects.toThrow("DataCloneError");
    expect(workers[0]?.terminated).toBe(true);
  });

  it("추론은 뜬 프레임을 소유권째 넘기고 result를 돌려준다", async () => {
    const frame = fakeFrame();
    const env = setup(async () => frame);
    const handle = await ready(env);
    const { worker } = env;

    const detecting = handle.detect(video, 500);
    await tick();
    worker.replyResult(RESULT);

    await expect(detecting).resolves.toEqual(RESULT);
    expect(worker.posted[1]).toEqual({
      message: { type: "detect", id: 2, handleId: 1, frame, timestampMs: 500 },
      transfer: [frame],
    });
  });

  it("detectFailed면 추론이 실패한다", async () => {
    const env = setup();
    const handle = await ready(env);
    const { worker } = env;

    const detecting = handle.detect(video, 0);
    await tick();
    worker.reply({
      type: "detectFailed",
      id: worker.lastId("detect"),
      reason: "timestamp must be monotonically increasing",
    });

    await expect(detecting).rejects.toThrow("monotonically");
  });

  it("프레임을 뜨지 못하면 FrameCaptureError로 실패하고 워커에 아무것도 보내지 않는다", async () => {
    const env = setup(async () => {
      throw new Error("InvalidStateError");
    });
    const handle = await ready(env);
    const { worker } = env;

    await expect(handle.detect(video, 0)).rejects.toBeInstanceOf(FrameCaptureError);
    expect(worker.posted).toHaveLength(1); // create 하나뿐
  });

  it("close()하면 워커를 끝내고, 기다리던 추론과 이후 추론이 바로 실패한다", async () => {
    const env = setup();
    const handle = await ready(env);
    const { worker } = env;
    const detecting = handle.detect(video, 0);
    await tick();

    handle.close();

    expect(worker.terminated).toBe(true);
    await expect(detecting).rejects.toThrow("워커가 닫혔다");
    await expect(handle.detect(video, 1)).rejects.toThrow("워커가 닫혔다");
    // create, 닫히기 전 detect 하나, 그 모델을 놓으라는 close
    expect(worker.posted.map((entry) => entry.message.type)).toEqual(["create", "detect", "close"]);
  });

  it("생성 뒤 워커가 죽으면 이후 추론은 워커에 보내지 않고 바로 실패한다 — 답을 기다리다 루프가 멈추지 않게", async () => {
    const env = setup();
    const handle = await ready(env);
    const { worker } = env;

    const event = worker.crash("out of memory");
    expect(event.preventDefault).toHaveBeenCalledTimes(1);

    // 원래 이유가 남아야 5회 실패 뒤 Sentry에 무엇이 죽였는지 올라간다.
    await expect(handle.detect(video, 0)).rejects.toThrow("out of memory");
    expect(worker.posted).toHaveLength(1);
  });

  it("앞 추론이 끝나기 전에 다시 부르면 워커에 보내지 않고 바로 실패한다 — 앞 추론의 답을 잃지 않게", async () => {
    const env = setup();
    const handle = await ready(env);
    const { worker } = env;

    const first = handle.detect(video, 0);
    const second = handle.detect(video, 1);

    await expect(second).rejects.toThrow("이전 추론이 끝나지 않았다");
    await tick();
    expect(worker.posted).toHaveLength(2); // create, 첫 detect 하나
    worker.replyResult(RESULT);
    await expect(first).resolves.toEqual(RESULT);
  });

  it("프레임을 워커로 보내지 못하면 프레임을 닫고 실패하며, 다음 추론은 막히지 않는다", async () => {
    const frame = fakeFrame();
    const env = setup(async () => frame);
    const handle = await ready(env);
    const { worker } = env;

    worker.failDetectPost = true;
    await expect(handle.detect(video, 0)).rejects.toThrow("DataCloneError");
    expect(frame.close).toHaveBeenCalledTimes(1);

    worker.failDetectPost = false;
    const detecting = handle.detect(video, 1);
    await tick();
    worker.replyResult(RESULT);
    await expect(detecting).resolves.toEqual(RESULT);
  });
});

function fakeHandle(runtime: "worker" | "main") {
  return {
    runtime,
    assetTimings: [],
    detect: vi.fn(async () => RESULT),
    capture: vi.fn(async (): Promise<ArrayBuffer> => PHOTO),
    close: vi.fn(),
  } satisfies MediapipeDetectorHandle;
}

function fakeFaceHandle(runtime: "worker" | "main") {
  return {
    runtime,
    detect: vi.fn(async () => FACE_RESULT),
    close: vi.fn(),
  } satisfies MediapipeFaceLandmarkerHandle;
}

function runtimeOf(
  create: () => Promise<MediapipeDetectorHandle>,
  createFace: () => Promise<MediapipeFaceLandmarkerHandle> = async () => {
    throw new Error("이 테스트는 얼굴 모델을 쓰지 않는다");
  },
) {
  const createDetector = vi.fn(create);
  const createFaceLandmarker = vi.fn(createFace);
  return {
    runtime: { createDetector, createFaceLandmarker } satisfies MediapipeVisionRuntime,
    createDetector,
    createFaceLandmarker,
  };
}

describe("createFallbackRuntime", () => {
  it("워커 검출기를 만들지 못하면 메인 스레드 런타임으로 만든다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const main = fakeHandle("main");
    const primary = runtimeOf(async () => {
      throw new Error("OffscreenCanvas is not defined");
    });
    const fallback = runtimeOf(async () => main);

    const handle = await createFallbackRuntime(
      primary.runtime,
      async () => fallback.runtime,
    ).createDetector(OPTIONS);

    expect(handle.runtime).toBe("main");
    await expect(handle.detect(video, 0)).resolves.toEqual(RESULT);
    expect(main.detect).toHaveBeenCalledTimes(1);
    expect(fallback.createDetector).toHaveBeenCalledWith(OPTIONS);
  });

  it("워커가 되면 메인 스레드 런타임을 불러오지도 않는다", async () => {
    const worker = fakeHandle("worker");
    const primary = runtimeOf(async () => worker);
    const loadFallback = vi.fn();

    const handle = await createFallbackRuntime(primary.runtime, loadFallback).createDetector(
      OPTIONS,
    );

    expect(handle.runtime).toBe("worker");
    await expect(handle.detect(video, 0)).resolves.toEqual(RESULT);
    expect(loadFallback).not.toHaveBeenCalled();
  });

  it("프레임을 뜨지 못하면 워커를 닫고 메인 스레드 검출기로 한 번 갈아탄다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const worker = fakeHandle("worker");
    worker.detect.mockRejectedValue(new FrameCaptureError("InvalidStateError"));
    const main = fakeHandle("main");
    const fallback = runtimeOf(async () => main);
    const loadFallback = vi.fn(async () => fallback.runtime);

    const handle = await createFallbackRuntime(
      runtimeOf(async () => worker).runtime,
      loadFallback,
    ).createDetector(OPTIONS);

    await expect(handle.detect(video, 0)).resolves.toEqual(RESULT);
    await expect(handle.detect(video, 1)).resolves.toEqual(RESULT);
    expect(worker.close).toHaveBeenCalledTimes(1);
    expect(loadFallback).toHaveBeenCalledTimes(1);
    expect(main.detect).toHaveBeenCalledTimes(2);
    expect(handle.runtime).toBe("main");
  });

  it("프레임 뜨기가 아닌 실패는 그대로 던지고 갈아타지 않는다", async () => {
    const worker = fakeHandle("worker");
    worker.detect.mockRejectedValue(new Error("detectFailed"));
    const loadFallback = vi.fn();

    const handle = await createFallbackRuntime(
      runtimeOf(async () => worker).runtime,
      loadFallback,
    ).createDetector(OPTIONS);

    await expect(handle.detect(video, 0)).rejects.toThrow("detectFailed");
    expect(loadFallback).not.toHaveBeenCalled();
    expect(handle.runtime).toBe("worker");
  });

  it("갈아타는 도중 close()되면 뒤늦게 만들어진 메인 스레드 검출기를 닫는다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const worker = fakeHandle("worker");
    worker.detect.mockRejectedValue(new FrameCaptureError("InvalidStateError"));
    const main = fakeHandle("main");
    let resolveMain: (handle: MediapipeDetectorHandle) => void = () => {};
    const fallback = runtimeOf(
      () =>
        new Promise<MediapipeDetectorHandle>((resolve) => {
          resolveMain = resolve;
        }),
    );

    const handle = await createFallbackRuntime(
      runtimeOf(async () => worker).runtime,
      async () => fallback.runtime,
    ).createDetector(OPTIONS);
    const detecting = handle.detect(video, 0);
    await tick();
    handle.close();
    resolveMain(main);

    await expect(detecting).rejects.toThrow("검출기가 닫혔다");
    expect(main.close).toHaveBeenCalledTimes(1);
    expect(main.detect).not.toHaveBeenCalled();
  });

  it("프레임을 뜨는 도중 close()되고 뜨기가 실패하면 갈아타지 않는다 — 이미 떠난 세션이다", async () => {
    let failCapture: (error: Error) => void = () => {};
    const worker = fakeHandle("worker");
    worker.detect.mockImplementation(
      () =>
        new Promise<MediapipeDetectionResult>((_, reject) => {
          failCapture = reject;
        }),
    );
    const loadFallback = vi.fn();

    const handle = await createFallbackRuntime(
      runtimeOf(async () => worker).runtime,
      loadFallback,
    ).createDetector(OPTIONS);
    const detecting = handle.detect(video, 0);
    handle.close();
    failCapture(new FrameCaptureError("InvalidStateError"));

    await expect(detecting).rejects.toBeInstanceOf(FrameCaptureError);
    expect(loadFallback).not.toHaveBeenCalled();
  });

  it("메인 스레드 검출기로 갈아타다 실패하면 그 오류로 실패하고 runtime은 main을 가리킨다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const worker = fakeHandle("worker");
    worker.detect.mockRejectedValue(new FrameCaptureError("InvalidStateError"));

    const handle = await createFallbackRuntime(runtimeOf(async () => worker).runtime, async () => {
      throw new Error("wasm 로드 실패");
    }).createDetector(OPTIONS);

    await expect(handle.detect(video, 0)).rejects.toThrow("wasm 로드 실패");
    expect(worker.close).toHaveBeenCalledTimes(1);
    expect(handle.runtime).toBe("main");
  });
});

describe("createWorkerRuntime — 객체 검출기와 얼굴 모델이 워커 하나를 함께 쓴다", () => {
  it("두 모델을 열어도 워커는 하나만 띄운다", async () => {
    const env = setup();

    await ready(env);
    await readyFace(env);

    expect(env.workers).toHaveLength(1);
    expect(env.worker.posted.map((entry) => entry.message)).toEqual([
      { type: "create", id: 1, model: "object", options: OPTIONS },
      { type: "create", id: 2, model: "face", options: FACE_OPTIONS },
    ]);
  });

  it("두 모델의 추론이 겹쳐도 id로 짝지어 각자의 답을 받는다", async () => {
    const env = setup();
    const detector = await ready(env);
    const landmarker = await readyFace(env);

    const objectDetecting = detector.detect(video, 0);
    const faceDetecting = landmarker.detect(video, 0);
    await tick();
    const [objectRequest, faceRequest] = env.worker.posted
      .map((entry) => entry.message)
      .filter((message) => message.type === "detect");
    if (objectRequest?.type !== "detect" || faceRequest?.type !== "detect") {
      throw new Error("두 추론이 모두 나가야 한다");
    }
    expect(objectRequest.handleId).toBe(1);
    expect(faceRequest.handleId).toBe(2);

    // 늦게 보낸 얼굴 답이 먼저 와도 섞이지 않는다.
    env.worker.reply({ type: "result", id: faceRequest.id, model: "face", result: FACE_RESULT });
    env.worker.reply({ type: "result", id: objectRequest.id, model: "object", result: RESULT });

    await expect(faceDetecting).resolves.toEqual(FACE_RESULT);
    await expect(objectDetecting).resolves.toEqual(RESULT);
  });

  it("한 모델을 닫으면 그 모델만 놓고 워커는 남는다. 마지막 모델이 닫을 때 워커를 끝낸다", async () => {
    const env = setup();
    const detector = await ready(env);
    const landmarker = await readyFace(env);

    landmarker.close();

    expect(env.worker.terminated).toBe(false);
    expect(env.worker.posted.at(-1)?.message).toEqual({ type: "close", handleId: 2 });
    await expect(landmarker.detect(video, 0)).rejects.toThrow("워커가 닫혔다");

    detector.close();

    expect(env.worker.terminated).toBe(true);
  });

  it("얼굴 모델 생성이 실패해도 객체 검출기가 쓰는 워커는 끝내지 않는다", async () => {
    const env = setup();
    const detector = await ready(env);

    const creating = env.runtime.createFaceLandmarker(FACE_OPTIONS);
    env.worker.reply({ type: "createFailed", id: env.worker.lastId("create"), reason: "404" });

    await expect(creating).rejects.toThrow("워커 검출기 생성 실패: 404");
    expect(env.worker.terminated).toBe(false);
    const detecting = detector.detect(video, 0);
    await tick();
    env.worker.replyResult(RESULT);
    await expect(detecting).resolves.toEqual(RESULT);
  });

  it("워커가 죽으면 두 모델이 함께 실패하고, 다음에 여는 모델은 새 워커를 띄운다", async () => {
    const env = setup();
    const detector = await ready(env);
    const landmarker = await readyFace(env);
    const dead = env.worker;

    dead.crash("out of memory");

    await expect(detector.detect(video, 0)).rejects.toThrow("out of memory");
    await expect(landmarker.detect(video, 0)).rejects.toThrow("out of memory");
    await ready(env);
    expect(env.workers).toHaveLength(2);
    expect(env.worker).not.toBe(dead);
  });

  it("모든 모델을 닫은 뒤 다시 열면 새 워커를 띄운다 — 세션마다 wasm 힙을 새로 받는다", async () => {
    const env = setup();
    (await ready(env)).close();

    await ready(env);

    expect(env.workers).toHaveLength(2);
    expect(env.workers[0]?.terminated).toBe(true);
    expect(env.workers[1]?.terminated).toBe(false);
  });
});

describe("createFallbackRuntime — 얼굴 모델", () => {
  it("워커 얼굴 모델을 만들지 못하면 메인 스레드에서 만든다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const main = fakeFaceHandle("main");
    const primary = runtimeOf(
      async () => fakeHandle("worker"),
      async () => {
        throw new Error("OffscreenCanvas is not defined");
      },
    );
    const fallback = runtimeOf(
      async () => fakeHandle("main"),
      async () => main,
    );

    const handle = await createFallbackRuntime(
      primary.runtime,
      async () => fallback.runtime,
    ).createFaceLandmarker(FACE_OPTIONS);

    expect(handle.runtime).toBe("main");
    await expect(handle.detect(video, 0)).resolves.toEqual(FACE_RESULT);
    expect(fallback.createFaceLandmarker).toHaveBeenCalledWith(FACE_OPTIONS);
  });

  it("프레임을 뜨지 못하면 얼굴 모델도 메인 스레드로 한 번 갈아탄다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const worker = fakeFaceHandle("worker");
    worker.detect.mockRejectedValue(new FrameCaptureError("InvalidStateError"));
    const main = fakeFaceHandle("main");
    const loadFallback = vi.fn(
      async () =>
        runtimeOf(
          async () => fakeHandle("main"),
          async () => main,
        ).runtime,
    );

    const handle = await createFallbackRuntime(
      runtimeOf(
        async () => fakeHandle("worker"),
        async () => worker,
      ).runtime,
      loadFallback,
    ).createFaceLandmarker(FACE_OPTIONS);

    await expect(handle.detect(video, 0)).resolves.toEqual(FACE_RESULT);
    await expect(handle.detect(video, 1)).resolves.toEqual(FACE_RESULT);
    expect(worker.close).toHaveBeenCalledTimes(1);
    expect(loadFallback).toHaveBeenCalledTimes(1);
    expect(handle.runtime).toBe("main");
  });
});

const PHOTO = new Uint8Array([0xff, 0xd8]).buffer;

describe("createWorkerRuntime 타임랩스 사진", () => {
  const spec = { aspect: "9:16" as const, mask: true };

  it("얼굴 추론에 사진을 요청하면 detect 메시지에 싣고 답의 사진을 결과에 붙인다", async () => {
    const frame = fakeFrame();
    const env = setup(async () => frame);
    const handle = await readyFace(env);
    const { worker } = env;

    const detecting = handle.detect(video, 700, spec);
    await tick();
    worker.reply({
      type: "result",
      id: worker.lastId("detect"),
      model: "face",
      result: FACE_RESULT,
      photo: PHOTO,
    });

    await expect(detecting).resolves.toEqual({ ...FACE_RESULT, photo: PHOTO });
    expect(worker.posted.at(-1)).toEqual({
      message: { type: "detect", id: 2, handleId: 1, frame, timestampMs: 700, photo: spec },
      transfer: [frame],
    });
  });

  it("사진을 요청하지 않으면 detect 메시지에 사진 키가 없다", async () => {
    const env = setup();
    const handle = await readyFace(env);

    void handle.detect(video, 700);
    await tick();

    expect(Object.keys(env.worker.posted.at(-1)?.message ?? {})).not.toContain("photo");
  });
});

describe("createWorkerRuntime capture", () => {
  const spec = { aspect: "9:16" as const, mask: true };

  it("객체 검출기 핸들의 capture는 뜬 프레임을 capture로 넘기고 사진을 돌려준다", async () => {
    const frame = fakeFrame();
    const env = setup(async () => frame);
    const handle = await ready(env);
    const { worker } = env;

    const capturing = handle.capture(video, spec);
    await tick();
    worker.reply({ type: "captured", id: worker.lastId("capture"), photo: PHOTO });

    await expect(capturing).resolves.toBe(PHOTO);
    expect(worker.posted.at(-1)).toEqual({
      message: { type: "capture", id: 2, frame, photo: spec },
      transfer: [frame],
    });
  });

  it("captureFailed면 capture가 실패한다", async () => {
    const env = setup();
    const handle = await ready(env);

    const capturing = handle.capture(video, spec);
    await tick();
    env.worker.reply({
      type: "captureFailed",
      id: env.worker.lastId("capture"),
      reason: "2D 컨텍스트를 만들지 못했다",
    });

    await expect(capturing).rejects.toThrow("2D 컨텍스트");
  });
});

describe("createFallbackRuntime 타임랩스 사진", () => {
  it("사진 요청이 프레임을 뜨지 못해도 메인 스레드 검출기로 한 번 갈아탄다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const worker = fakeHandle("worker");
    worker.capture.mockRejectedValue(new FrameCaptureError("InvalidStateError"));
    const main = fakeHandle("main");
    const loadFallback = vi.fn(async () => runtimeOf(async () => main).runtime);

    const handle = await createFallbackRuntime(
      runtimeOf(async () => worker).runtime,
      loadFallback,
    ).createDetector(OPTIONS);

    await expect(handle.capture(video, { aspect: "9:16", mask: false })).resolves.toBe(PHOTO);
    await expect(handle.detect(video, 1)).resolves.toEqual(RESULT);
    expect(worker.close).toHaveBeenCalledTimes(1);
    expect(loadFallback).toHaveBeenCalledTimes(1);
    expect(main.capture).toHaveBeenCalledTimes(1);
    expect(handle.runtime).toBe("main");
  });

  it("얼굴 모델은 사진 요청을 지금 핸들에 그대로 넘긴다", async () => {
    const worker = fakeFaceHandle("worker");
    const spec = { aspect: "16:9" as const, mask: true };

    const handle = await createFallbackRuntime(
      runtimeOf(
        async () => fakeHandle("worker"),
        async () => worker,
      ).runtime,
      vi.fn(),
    ).createFaceLandmarker(FACE_OPTIONS);
    await handle.detect(video, 3, spec);

    expect(worker.detect).toHaveBeenCalledWith(video, 3, spec);
  });
});
