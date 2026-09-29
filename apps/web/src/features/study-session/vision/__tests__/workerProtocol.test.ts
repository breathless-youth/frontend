import { describe, expect, it, vi } from "vitest";

import type { AssetTiming, DetectorCreateOptions } from "../objectDetector";
import type { WorkerDetector, WorkerToMainMessage } from "../workerProtocol";
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

const TIMING: AssetTiming = {
  name: "https://web.focusmakers.app/models/efficientdet_lite0_int8.tflite",
  startTime: 1_700_000_000_000,
  transferSize: 0,
  encodedBodySize: 4_000_000,
  decodedBodySize: 4_000_000,
};

function fakeFrame() {
  return { close: vi.fn() } as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };
}

function setup(detector: WorkerDetector | Error) {
  const posted: WorkerToMainMessage[] = [];
  const handle = createWorkerMessageHandler({
    createDetector: vi.fn(async () => {
      if (detector instanceof Error) {
        throw detector;
      }
      return detector;
    }),
    readAssetTimings: () => [TIMING],
    post: (message) => posted.push(message),
  });
  return { posted, handle };
}

function fakeDetector() {
  return {
    detectForVideo: vi.fn(() => ({ detections: [] })),
    close: vi.fn(),
  };
}

describe("createWorkerMessageHandler", () => {
  it("검출기를 만들면 받은 자원의 Resource Timing과 함께 created로 답한다", async () => {
    const { posted, handle } = setup(fakeDetector());

    await handle({ type: "create", options: OPTIONS });

    expect(posted).toEqual([{ type: "created", assetTimings: [TIMING] }]);
  });

  it("검출기를 만들지 못하면 이유를 담아 createFailed로 답한다", async () => {
    const { posted, handle } = setup(new Error("document is not defined"));

    await handle({ type: "create", options: OPTIONS });

    expect(posted).toEqual([{ type: "createFailed", reason: "document is not defined" }]);
  });

  it("추론 결과를 result로 돌려주고 프레임을 바로 놓는다", async () => {
    const detector = fakeDetector();
    const { posted, handle } = setup(detector);
    await handle({ type: "create", options: OPTIONS });
    const frame = fakeFrame();

    await handle({ type: "detect", frame, timestampMs: 500 });

    expect(detector.detectForVideo).toHaveBeenCalledWith(frame, 500);
    expect(posted.at(-1)).toEqual({ type: "result", result: { detections: [] } });
    expect(frame.close).toHaveBeenCalledTimes(1);
  });

  it("추론이 던지면 detectFailed로 답하고 프레임은 그래도 놓는다", async () => {
    const detector = fakeDetector();
    detector.detectForVideo.mockImplementation(() => {
      throw new Error("timestamp must be monotonically increasing");
    });
    const { posted, handle } = setup(detector);
    await handle({ type: "create", options: OPTIONS });
    const frame = fakeFrame();

    await handle({ type: "detect", frame, timestampMs: 0 });

    expect(posted.at(-1)).toEqual({
      type: "detectFailed",
      reason: "timestamp must be monotonically increasing",
    });
    expect(frame.close).toHaveBeenCalledTimes(1);
  });

  it("검출기 없이 추론을 받으면 detectFailed로 답하고 프레임을 놓는다", async () => {
    const { posted, handle } = setup(fakeDetector());
    const frame = fakeFrame();

    await handle({ type: "detect", frame, timestampMs: 0 });

    expect(posted).toEqual([{ type: "detectFailed", reason: "검출기가 없다" }]);
    expect(frame.close).toHaveBeenCalledTimes(1);
  });
});
