import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DetectorCreateOptions,
  MediapipeDetectionResult,
  MediapipeDetectorHandle,
  MediapipeVisionRuntime,
} from "../objectDetector";
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

  crash(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

const OPTIONS: DetectorCreateOptions = {
  wasmPath: "/mediapipe/wasm",
  modelAssetPath: "/models/efficientdet_lite0_int8.tflite",
  delegate: "CPU",
  categoryAllowlist: ["person", "cell phone"],
  scoreThreshold: 0.3,
};

const RESULT: MediapipeDetectionResult = {
  detections: [{ categories: [{ categoryName: "person", score: 0.9 }] }],
};

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
  const worker = new FakeWorker();
  const runtime = createWorkerRuntime({
    createWorker: () => worker,
    captureFrame,
    timeOrigin: 1_000,
  });
  return { worker, runtime };
}

async function ready(worker: FakeWorker, runtime: MediapipeVisionRuntime) {
  const creating = runtime.createDetector(OPTIONS);
  worker.reply({ type: "created", assetTimings: [] });
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
    const { worker, runtime } = setup();

    const creating = runtime.createDetector(OPTIONS);
    worker.reply({
      type: "created",
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
      message: { type: "create", options: OPTIONS },
      transfer: [],
    });
    expect(handle.runtime).toBe("worker");
    expect(handle.assetTimings).toEqual([
      { name: "x.wasm", startTime: 500, transferSize: 0, encodedBodySize: 9, decodedBodySize: 9 },
    ]);
  });

  it("createFailed면 워커를 끝내고 생성이 실패한다", async () => {
    const { worker, runtime } = setup();

    const creating = runtime.createDetector(OPTIONS);
    worker.reply({ type: "createFailed", reason: "document is not defined" });

    await expect(creating).rejects.toThrow("document is not defined");
    expect(worker.terminated).toBe(true);
  });

  it("생성 중 워커 오류(error 이벤트)면 워커를 끝내고 생성이 실패한다", async () => {
    const { worker, runtime } = setup();

    const creating = runtime.createDetector(OPTIONS);
    worker.crash("SyntaxError: Cannot use import statement outside a module");

    await expect(creating).rejects.toThrow("SyntaxError");
    expect(worker.terminated).toBe(true);
  });

  it("create를 보내다 던지면 워커를 끝내고 생성이 실패한다", async () => {
    const { worker, runtime } = setup();
    worker.failCreatePost = true;

    await expect(runtime.createDetector(OPTIONS)).rejects.toThrow("DataCloneError");
    expect(worker.terminated).toBe(true);
  });

  it("추론은 뜬 프레임을 소유권째 넘기고 result를 돌려준다", async () => {
    const frame = fakeFrame();
    const { worker, runtime } = setup(async () => frame);
    const handle = await ready(worker, runtime);

    const detecting = handle.detect(video, 500);
    await tick();
    worker.reply({ type: "result", result: RESULT });

    await expect(detecting).resolves.toEqual(RESULT);
    expect(worker.posted[1]).toEqual({
      message: { type: "detect", frame, timestampMs: 500 },
      transfer: [frame],
    });
  });

  it("detectFailed면 추론이 실패한다", async () => {
    const { worker, runtime } = setup();
    const handle = await ready(worker, runtime);

    const detecting = handle.detect(video, 0);
    await tick();
    worker.reply({ type: "detectFailed", reason: "timestamp must be monotonically increasing" });

    await expect(detecting).rejects.toThrow("monotonically");
  });

  it("프레임을 뜨지 못하면 FrameCaptureError로 실패하고 워커에 아무것도 보내지 않는다", async () => {
    const { worker, runtime } = setup(async () => {
      throw new Error("InvalidStateError");
    });
    const handle = await ready(worker, runtime);

    await expect(handle.detect(video, 0)).rejects.toBeInstanceOf(FrameCaptureError);
    expect(worker.posted).toHaveLength(1); // create 하나뿐
  });

  it("close()하면 워커를 끝내고, 기다리던 추론과 이후 추론이 바로 실패한다", async () => {
    const { worker, runtime } = setup();
    const handle = await ready(worker, runtime);
    const detecting = handle.detect(video, 0);
    await tick();

    handle.close();

    expect(worker.terminated).toBe(true);
    await expect(detecting).rejects.toThrow("워커가 닫혔다");
    await expect(handle.detect(video, 1)).rejects.toThrow("워커가 닫혔다");
    expect(worker.posted).toHaveLength(2); // create, 닫히기 전 detect 하나
  });

  it("생성 뒤 워커가 죽으면 이후 추론은 워커에 보내지 않고 바로 실패한다 — 답을 기다리다 루프가 멈추지 않게", async () => {
    const { worker, runtime } = setup();
    const handle = await ready(worker, runtime);

    worker.crash("out of memory");

    // 원래 이유가 남아야 5회 실패 뒤 Sentry에 무엇이 죽였는지 올라간다.
    await expect(handle.detect(video, 0)).rejects.toThrow("out of memory");
    expect(worker.posted).toHaveLength(1);
  });

  it("앞 추론이 끝나기 전에 다시 부르면 워커에 보내지 않고 바로 실패한다 — 앞 추론의 답을 잃지 않게", async () => {
    const { worker, runtime } = setup();
    const handle = await ready(worker, runtime);

    const first = handle.detect(video, 0);
    const second = handle.detect(video, 1);

    await expect(second).rejects.toThrow("이전 추론이 끝나지 않았다");
    await tick();
    expect(worker.posted).toHaveLength(2); // create, 첫 detect 하나
    worker.reply({ type: "result", result: RESULT });
    await expect(first).resolves.toEqual(RESULT);
  });

  it("프레임을 워커로 보내지 못하면 프레임을 닫고 실패하며, 다음 추론은 막히지 않는다", async () => {
    const frame = fakeFrame();
    const { worker, runtime } = setup(async () => frame);
    const handle = await ready(worker, runtime);

    worker.failDetectPost = true;
    await expect(handle.detect(video, 0)).rejects.toThrow("DataCloneError");
    expect(frame.close).toHaveBeenCalledTimes(1);

    worker.failDetectPost = false;
    const detecting = handle.detect(video, 1);
    await tick();
    worker.reply({ type: "result", result: RESULT });
    await expect(detecting).resolves.toEqual(RESULT);
  });
});

function fakeHandle(runtime: "worker" | "main") {
  return {
    runtime,
    assetTimings: [],
    detect: vi.fn(async () => RESULT),
    close: vi.fn(),
  } satisfies MediapipeDetectorHandle;
}

function runtimeOf(create: () => Promise<MediapipeDetectorHandle>) {
  const createDetector = vi.fn(create);
  return { runtime: { createDetector } satisfies MediapipeVisionRuntime, createDetector };
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

    expect(handle).toBe(main);
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
