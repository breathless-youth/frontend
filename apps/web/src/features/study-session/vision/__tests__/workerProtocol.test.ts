import { describe, expect, it, vi } from "vitest";

import type {
  AssetTiming,
  DetectorCreateOptions,
  FaceLandmarkerCreateOptions,
} from "../mediapipePort";
import type { PhotoInput } from "@/features/timelapse/photoFrame";

import type { WorkerDetector, WorkerFaceLandmarker, WorkerToMainMessage } from "../workerProtocol";
import { createWorkerMessageHandler } from "../workerProtocol";

/**
 * 워커 파일인 `visionWorker.ts`는 MediaPipe와 워커 전역을 잇기만 하고, 메시지 처리는 이 순수 함수가 한다.
 * 그래서 Worker도 MediaPipe도 없이 처리 규칙을 검증한다.
 */

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

const FACE_RESULT = { faceLandmarks: [], faceBlendshapes: [] };

const TIMING: AssetTiming = {
  name: "https://web.focusmakers.app/models/efficientdet_lite0_int8.tflite",
  startTime: 1_700_000_000_000,
  transferSize: 0,
  encodedBodySize: 4_000_000,
  decodedBodySize: 4_000_000,
};

function fakeFrame() {
  return { close: vi.fn(), width: 1280, height: 720 } as unknown as ImageBitmap & {
    close: ReturnType<typeof vi.fn>;
  };
}

const PHOTO = new Uint8Array([0xff, 0xd8]).buffer;

function setup(
  detector: WorkerDetector | Error,
  landmarker: WorkerFaceLandmarker | Error = fakeLandmarker(),
  renderPhoto: (input: PhotoInput) => Promise<ArrayBuffer> = async () => PHOTO,
) {
  const posted: WorkerToMainMessage[] = [];
  /** 메시지마다 함께 넘긴 transfer 목록이고 없으면 undefined다. */
  const transfers: (Transferable[] | undefined)[] = [];
  const render = vi.fn(renderPhoto);
  const handle = createWorkerMessageHandler({
    createDetector: vi.fn(async () => {
      if (detector instanceof Error) {
        throw detector;
      }
      return detector;
    }),
    createFaceLandmarker: vi.fn(async () => {
      if (landmarker instanceof Error) {
        throw landmarker;
      }
      return landmarker;
    }),
    readAssetTimings: () => [TIMING],
    renderPhoto: render,
    post: (message, transfer) => {
      posted.push(message);
      transfers.push(transfer);
    },
  });
  return { posted, transfers, handle, renderPhoto: render };
}

function fakeDetector() {
  return {
    detectForVideo: vi.fn(() => ({ detections: [] })),
    close: vi.fn(),
  };
}

function fakeLandmarker() {
  return {
    detectForVideo: vi.fn(() => FACE_RESULT),
    close: vi.fn(),
  };
}

describe("createWorkerMessageHandler", () => {
  it("검출기를 만들면 받은 자원의 Resource Timing과 함께 created로 답한다", async () => {
    const { posted, handle } = setup(fakeDetector());

    await handle({ type: "create", id: 1, model: "object", options: OPTIONS });

    expect(posted).toEqual([{ type: "created", id: 1, assetTimings: [TIMING] }]);
  });

  it("검출기를 만들지 못하면 이유를 담아 createFailed로 답한다", async () => {
    const { posted, handle } = setup(new Error("document is not defined"));

    await handle({ type: "create", id: 1, model: "object", options: OPTIONS });

    expect(posted).toEqual([{ type: "createFailed", id: 1, reason: "document is not defined" }]);
  });

  it("추론 결과를 result로 돌려주고 프레임을 바로 놓는다", async () => {
    const detector = fakeDetector();
    const { posted, handle } = setup(detector);
    await handle({ type: "create", id: 1, model: "object", options: OPTIONS });
    const frame = fakeFrame();

    await handle({ type: "detect", id: 2, handleId: 1, frame, timestampMs: 500 });

    expect(detector.detectForVideo).toHaveBeenCalledWith(frame, 500);
    expect(posted.at(-1)).toEqual({
      type: "result",
      id: 2,
      model: "object",
      result: { detections: [] },
    });
    expect(frame.close).toHaveBeenCalledTimes(1);
  });

  it("추론이 던지면 detectFailed로 답하고 프레임은 그래도 놓는다", async () => {
    const detector = fakeDetector();
    detector.detectForVideo.mockImplementation(() => {
      throw new Error("timestamp must be monotonically increasing");
    });
    const { posted, handle } = setup(detector);
    await handle({ type: "create", id: 1, model: "object", options: OPTIONS });
    const frame = fakeFrame();

    await handle({ type: "detect", id: 2, handleId: 1, frame, timestampMs: 0 });

    expect(posted.at(-1)).toEqual({
      type: "detectFailed",
      id: 2,
      reason: "timestamp must be monotonically increasing",
    });
    expect(frame.close).toHaveBeenCalledTimes(1);
  });

  it("검출기 없이 추론을 받으면 detectFailed로 답하고 프레임을 놓는다", async () => {
    const { posted, handle } = setup(fakeDetector());
    const frame = fakeFrame();

    await handle({ type: "detect", id: 5, handleId: 1, frame, timestampMs: 0 });

    expect(posted).toEqual([{ type: "detectFailed", id: 5, reason: "검출기가 없다" }]);
    expect(frame.close).toHaveBeenCalledTimes(1);
  });

  it("객체 검출기와 얼굴 모델을 한 워커에 함께 두고 handleId로 가른다", async () => {
    const detector = fakeDetector();
    const landmarker = fakeLandmarker();
    const { posted, handle } = setup(detector, landmarker);
    await handle({ type: "create", id: 1, model: "object", options: OPTIONS });
    await handle({ type: "create", id: 2, model: "face", options: FACE_OPTIONS });
    const frame = fakeFrame();

    await handle({ type: "detect", id: 3, handleId: 2, frame, timestampMs: 700 });

    expect(landmarker.detectForVideo).toHaveBeenCalledWith(frame, 700);
    expect(detector.detectForVideo).not.toHaveBeenCalled();
    expect(posted.at(-1)).toEqual({ type: "result", id: 3, model: "face", result: FACE_RESULT });
    expect(frame.close).toHaveBeenCalledTimes(1);
  });

  it("얼굴 모델만 실패해도 객체 검출기는 계속 답한다", async () => {
    const { posted, handle } = setup(fakeDetector(), new Error("face model 404"));
    await handle({ type: "create", id: 1, model: "object", options: OPTIONS });
    await handle({ type: "create", id: 2, model: "face", options: FACE_OPTIONS });

    await handle({ type: "detect", id: 3, handleId: 1, frame: fakeFrame(), timestampMs: 0 });

    expect(posted).toEqual([
      { type: "created", id: 1, assetTimings: [TIMING] },
      { type: "createFailed", id: 2, reason: "face model 404" },
      { type: "result", id: 3, model: "object", result: { detections: [] } },
    ]);
  });

  it("close는 그 모델만 닫고 다른 모델은 남긴다", async () => {
    const detector = fakeDetector();
    const landmarker = fakeLandmarker();
    const { posted, handle } = setup(detector, landmarker);
    await handle({ type: "create", id: 1, model: "object", options: OPTIONS });
    await handle({ type: "create", id: 2, model: "face", options: FACE_OPTIONS });

    await handle({ type: "close", handleId: 2 });
    await handle({ type: "detect", id: 3, handleId: 2, frame: fakeFrame(), timestampMs: 0 });
    await handle({ type: "detect", id: 4, handleId: 1, frame: fakeFrame(), timestampMs: 0 });

    expect(landmarker.close).toHaveBeenCalledTimes(1);
    expect(detector.close).not.toHaveBeenCalled();
    expect(posted.slice(-2)).toEqual([
      { type: "detectFailed", id: 3, reason: "검출기가 없다" },
      { type: "result", id: 4, model: "object", result: { detections: [] } },
    ]);
  });

  it("만드는 도중 close가 오면 다 만든 모델을 그 자리에서 닫고 created를 보내지 않는다", async () => {
    let finish: (value: WorkerFaceLandmarker) => void = () => {};
    const landmarker = fakeLandmarker();
    const posted: WorkerToMainMessage[] = [];
    const handle = createWorkerMessageHandler({
      createDetector: vi.fn(async () => fakeDetector()),
      createFaceLandmarker: () =>
        new Promise<WorkerFaceLandmarker>((resolve) => {
          finish = resolve;
        }),
      readAssetTimings: () => [],
      renderPhoto: async () => PHOTO,
      post: (message) => posted.push(message),
    });

    const creating = handle({ type: "create", id: 1, model: "face", options: FACE_OPTIONS });
    await handle({ type: "close", handleId: 1 });
    finish(landmarker);
    await creating;

    expect(landmarker.close).toHaveBeenCalledTimes(1);
    expect(posted).toEqual([]);
  });
});

describe("createWorkerMessageHandler 타임랩스 사진", () => {
  const LANDMARKS = [
    { x: 0.4, y: 0.3 },
    { x: 0.6, y: 0.6 },
  ];

  async function readyFace(renderPhoto?: (input: PhotoInput) => Promise<ArrayBuffer>) {
    const landmarker = {
      detectForVideo: vi.fn(() => ({ faceLandmarks: [LANDMARKS], faceBlendshapes: [] })),
      close: vi.fn(),
    };
    const env = setup(fakeDetector(), landmarker, renderPhoto);
    await env.handle({ type: "create", id: 1, model: "face", options: FACE_OPTIONS });
    return env;
  }

  it("사진을 요청하면 추론한 프레임과 그 랜드마크로 사진을 만들어 결과에 담는다", async () => {
    const env = await readyFace();
    const frame = fakeFrame();
    const photo = { aspect: "9:16" as const, mask: true };

    await env.handle({ type: "detect", id: 2, handleId: 1, frame, timestampMs: 0, photo });

    expect(env.renderPhoto).toHaveBeenCalledWith({
      source: frame,
      frame: { width: 1280, height: 720 },
      spec: photo,
      landmarks: LANDMARKS,
    });
    expect(env.posted.at(-1)).toEqual({
      type: "result",
      id: 2,
      model: "face",
      result: { faceLandmarks: [LANDMARKS], faceBlendshapes: [] },
      photo: PHOTO,
    });
    // 사진 바이트는 복사하지 않고 소유권째 넘긴다.
    expect(env.transfers.at(-1)).toEqual([PHOTO]);
    expect(frame.close).toHaveBeenCalledTimes(1);
  });

  it("사진을 요청하지 않으면 결과에 사진 키가 없고 사진을 만들지 않는다", async () => {
    const env = await readyFace();

    await env.handle({ type: "detect", id: 2, handleId: 1, frame: fakeFrame(), timestampMs: 0 });

    expect(env.renderPhoto).not.toHaveBeenCalled();
    expect(Object.keys(env.posted.at(-1) ?? {})).not.toContain("photo");
  });

  it("사진을 만들지 못해도 추론 결과는 사진 없이 보내고 프레임을 놓는다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = await readyFace(async () => {
      throw new Error("convertToBlob 실패");
    });
    const frame = fakeFrame();

    await env.handle({
      type: "detect",
      id: 2,
      handleId: 1,
      frame,
      timestampMs: 0,
      photo: { aspect: "9:16", mask: true },
    });

    expect(env.posted.at(-1)).toEqual({
      type: "result",
      id: 2,
      model: "face",
      result: { faceLandmarks: [LANDMARKS], faceBlendshapes: [] },
    });
    expect(frame.close).toHaveBeenCalledTimes(1);
  });
});

describe("createWorkerMessageHandler capture", () => {
  it("capture는 추론 없이 사진만 만들어 captured로 답하고 프레임을 놓는다", async () => {
    const detector = fakeDetector();
    const env = setup(detector);
    const frame = fakeFrame();
    const photo = { aspect: "16:9" as const, mask: false };

    await env.handle({ type: "capture", id: 3, frame, photo });

    expect(detector.detectForVideo).not.toHaveBeenCalled();
    expect(env.renderPhoto).toHaveBeenCalledWith({
      source: frame,
      frame: { width: 1280, height: 720 },
      spec: photo,
    });
    expect(env.posted).toEqual([{ type: "captured", id: 3, photo: PHOTO }]);
    expect(env.transfers).toEqual([[PHOTO]]);
    expect(frame.close).toHaveBeenCalledTimes(1);
  });

  it("capture가 실패하면 captureFailed로 답하고 프레임을 놓는다", async () => {
    const env = setup(fakeDetector(), fakeLandmarker(), async () => {
      throw new Error("2D 컨텍스트를 만들지 못했다");
    });
    const frame = fakeFrame();

    await env.handle({ type: "capture", id: 3, frame, photo: { aspect: "9:16", mask: false } });

    expect(env.posted).toEqual([
      { type: "captureFailed", id: 3, reason: "2D 컨텍스트를 만들지 못했다" },
    ]);
    expect(frame.close).toHaveBeenCalledTimes(1);
  });
});
