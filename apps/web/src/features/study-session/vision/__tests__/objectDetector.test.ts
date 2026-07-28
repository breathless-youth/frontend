import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DetectorCreateOptions,
  MediapipeDetectorHandle,
  MediapipeVisionRuntime,
} from "../objectDetector";
import { createObjectDetector, resolveModelVariant } from "../objectDetector";
import {
  CATEGORY_ALLOWLIST,
  DEFAULT_MODEL_VARIANT,
  DETECTOR_SCORE_THRESHOLD,
  MEDIAPIPE_WASM_PATH,
  MODEL_PATHS,
} from "../visionConfig";

/**
 * MediaPipe는 이 저장소에서 **`objectDetector.ts` 하나에만** 닿는다(설계 §3 워커 이전 여지).
 * 그래서 테스트도 실제 패키지가 아니라 그 모듈이 선언한 포트(`MediapipeVisionRuntime`)를
 * 주입해 검증한다 — 이 테스트는 `@mediapipe/tasks-vision` 설치 여부와 무관하게 돈다.
 */
function fakeHandle(result: unknown = { detections: [] }) {
  return {
    detectForVideo: vi.fn(() => result),
    close: vi.fn(),
  } as unknown as MediapipeDetectorHandle & {
    detectForVideo: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
}

function fakeRuntime(createDetector: (options: DetectorCreateOptions) => Promise<unknown>) {
  const spy = vi.fn(createDetector);
  const runtime = { createDetector: spy } as unknown as MediapipeVisionRuntime;
  return { runtime, createDetector: spy, loadRuntime: async () => runtime };
}

const video = {} as HTMLVideoElement;

/** 마이크로태스크를 전부 흘려보낸다 — "로딩이 실제로 진행 중인" 시점을 만들 때 쓴다. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * 폴백 기계를 검증할 때 쓰는 순서. **`DELEGATE_ORDER` 상수를 읽지 않는다** —
 * 기본값은 실측에 따라 바뀌는 값이고(S3에서 GPU 우선 → CPU로 뒤집혔다) 폴백 로직은
 * 그와 무관하게 옳아야 한다. 상수를 그대로 읽으면 기본값을 바꿀 때마다 폴백 테스트가
 * 함께 깨져서 "기본값이 바뀌었다"와 "폴백이 깨졌다"를 구분할 수 없게 된다.
 */
const TWO_DELEGATES = ["GPU", "CPU"] as const;

describe("createObjectDetector — delegate 기본값", () => {
  it("기본값은 CPU 하나다 — S3 실측에서 GPU가 조용히 틀린 값을 냈다", async () => {
    const handle = fakeHandle();
    const { loadRuntime, createDetector } = fakeRuntime(async () => handle);
    const detector = createObjectDetector({ loadRuntime });

    await expect(detector.load()).resolves.toBe("ready");

    // GPU를 **시도조차 하지 않는다.** 폴백은 "실패했을 때" 발동하는데 GPU는 실패하지 않고
    // 성공한 얼굴로 수천 건의 가짜 person을 내놓기 때문이다(visionConfig.ts 주석 참고).
    expect(detector.delegate).toBe("CPU");
    expect(createDetector).toHaveBeenCalledTimes(1);
    expect(createDetector.mock.calls[0]?.[0]).toMatchObject({ delegate: "CPU" });
  });
});

describe("createObjectDetector — 로딩", () => {
  it("GPU로 먼저 만들고 성공하면 delegate를 노출한다", async () => {
    const handle = fakeHandle();
    const { loadRuntime, createDetector } = fakeRuntime(async () => handle);
    const detector = createObjectDetector({ loadRuntime, delegateOrder: TWO_DELEGATES });

    await expect(detector.load()).resolves.toBe("ready");

    expect(detector.state).toBe("ready");
    expect(detector.delegate).toBe("GPU");
    expect(createDetector).toHaveBeenCalledTimes(1);
    expect(createDetector).toHaveBeenCalledWith({
      wasmPath: MEDIAPIPE_WASM_PATH,
      modelAssetPath: MODEL_PATHS[DEFAULT_MODEL_VARIANT],
      delegate: "GPU",
      categoryAllowlist: [...CATEGORY_ALLOWLIST],
      scoreThreshold: DETECTOR_SCORE_THRESHOLD,
    });
  });

  it("GPU가 실패하면 CPU로 폴백하고 어느 쪽으로 떨어졌는지 노출한다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const handle = fakeHandle();
    const { loadRuntime, createDetector } = fakeRuntime(async (options) => {
      if (options.delegate === "GPU") {
        throw new Error("WebGL context creation failed");
      }
      return handle;
    });
    const detector = createObjectDetector({ loadRuntime, delegateOrder: TWO_DELEGATES });

    await expect(detector.load()).resolves.toBe("ready");

    expect(detector.delegate).toBe("CPU");
    expect(createDetector).toHaveBeenCalledTimes(2);
    expect(createDetector.mock.calls[0]?.[0]).toMatchObject({ delegate: "GPU" });
    expect(createDetector.mock.calls[1]?.[0]).toMatchObject({ delegate: "CPU" });
  });

  it("전부 실패해도 던지지 않고 unavailable로 남는다 — 1회 재시도 뒤", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { loadRuntime, createDetector } = fakeRuntime(async () => {
      throw new Error("model fetch 404");
    });
    const detector = createObjectDetector({ loadRuntime, delegateOrder: TWO_DELEGATES });

    await expect(detector.load()).resolves.toBe("unavailable");

    expect(detector.state).toBe("unavailable");
    expect(detector.delegate).toBeNull();
    // (GPU, CPU) × 최초 1회 + 재시도 1회
    expect(createDetector).toHaveBeenCalledTimes(4);
  });

  it("MediaPipe 모듈 자체를 못 불러와도 던지지 않는다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const loadRuntime = vi.fn(async () => {
      throw new Error("Failed to fetch dynamically imported module");
    });
    const detector = createObjectDetector({ loadRuntime });

    await expect(detector.load()).resolves.toBe("unavailable");
    expect(loadRuntime).toHaveBeenCalledTimes(2); // 최초 + 재시도 1회
  });

  it("재시도에서 성공하면 ready가 된다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const handle = fakeHandle();
    let attempt = 0;
    const { loadRuntime } = fakeRuntime(async () => {
      attempt += 1;
      if (attempt <= 2) {
        throw new Error("transient");
      }
      return handle;
    });
    const detector = createObjectDetector({ loadRuntime, delegateOrder: TWO_DELEGATES });

    await expect(detector.load()).resolves.toBe("ready");
    expect(detector.delegate).toBe("GPU");
  });

  it("동시 load 두 번이 detector를 한 번만 만든다", async () => {
    const handle = fakeHandle();
    const { loadRuntime, createDetector } = fakeRuntime(async () => handle);
    const detector = createObjectDetector({ loadRuntime });

    await Promise.all([detector.load(), detector.load()]);

    expect(createDetector).toHaveBeenCalledTimes(1);
    expect(handle.close).not.toHaveBeenCalled();
  });

  it("이미 ready면 다시 만들지 않는다", async () => {
    const { loadRuntime, createDetector } = fakeRuntime(async () => fakeHandle());
    const detector = createObjectDetector({ loadRuntime });

    await detector.load();
    await detector.load();

    expect(createDetector).toHaveBeenCalledTimes(1);
  });
});

// mediaStreamCamera.ts의 `wanted` 취소 패턴과 같은 계약이다 —
// 모델 로딩 중 세션을 나가면 뒤늦게 해결된 detector가 GPU 컨텍스트를 쥔 채 고아로 남는다.
describe("createObjectDetector — 로딩 중 close", () => {
  it("로딩 도중 close가 들어오면 뒤늦게 도착한 detector를 그 자리에서 닫는다", async () => {
    const handle = fakeHandle();
    let resolveCreate: (value: MediapipeDetectorHandle) => void = () => {};
    const { loadRuntime } = fakeRuntime(
      () =>
        new Promise<MediapipeDetectorHandle>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const detector = createObjectDetector({ loadRuntime, delegateOrder: TWO_DELEGATES });

    const loading = detector.load();
    await tick(); // createDetector가 실제로 진행 중인 상태로 만든다
    detector.close(); // 아직 handle이 null인 시점
    resolveCreate(handle);
    await loading;

    expect(handle.close).toHaveBeenCalledTimes(1);
    expect(detector.state).toBe("idle");
    expect(detector.delegate).toBeNull();
    expect(detector.detect(video, 0)).toBeNull();
  });

  it("GPU 시도 중 close가 들어오면 CPU 폴백을 시작하지 않는다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let rejectCreate: (reason: Error) => void = () => {};
    const { loadRuntime, createDetector } = fakeRuntime(
      () =>
        new Promise<MediapipeDetectorHandle>((_resolve, reject) => {
          rejectCreate = reject;
        }),
    );
    const detector = createObjectDetector({ loadRuntime });

    const loading = detector.load();
    await tick(); // GPU 시도가 실제로 진행 중인 상태
    expect(createDetector).toHaveBeenCalledTimes(1);

    detector.close();
    rejectCreate(new Error("WebGL context creation failed"));
    await loading;

    expect(createDetector).toHaveBeenCalledTimes(1); // CPU 폴백도, 재시도도 없다
    expect(detector.state).toBe("idle");
  });

  it("close가 detector를 닫고 다시 load하면 새로 만든다", async () => {
    const first = fakeHandle();
    const second = fakeHandle();
    let created = 0;
    const { loadRuntime } = fakeRuntime(async () => {
      created += 1;
      return created === 1 ? first : second;
    });
    const detector = createObjectDetector({ loadRuntime });

    await detector.load();
    detector.close();
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(detector.state).toBe("idle");

    await detector.load();
    expect(detector.state).toBe("ready");
    expect(detector.detect(video, 0)).not.toBeNull();
  });
});

describe("createObjectDetector — 추론", () => {
  it("ready 이전에는 null을 돌려준다 (감지 불가)", () => {
    const { loadRuntime } = fakeRuntime(async () => fakeHandle());
    const detector = createObjectDetector({ loadRuntime });

    expect(detector.state).toBe("idle");
    expect(detector.detect(video, 0)).toBeNull();
  });

  it("MediaPipe 결과를 우리 타입으로 정규화한다", async () => {
    const handle = fakeHandle({
      detections: [
        {
          categories: [
            { categoryName: "cell phone", score: 0.2 },
            { categoryName: "person", score: 0.81 },
          ],
          boundingBox: { originX: 12, originY: 34, width: 56, height: 78, angle: 0 },
        },
      ],
    });
    const { loadRuntime } = fakeRuntime(async () => handle);
    const detector = createObjectDetector({ loadRuntime });
    await detector.load();

    const result = detector.detect(video, 1234);

    expect(handle.detectForVideo).toHaveBeenCalledWith(video, 1234);
    expect(result?.detections).toEqual([
      { label: "person", score: 0.81, box: { originX: 12, originY: 34, width: 56, height: 78 } },
    ]);
    expect(typeof result?.durationMs).toBe("number");
    // MediaPipe 원본 타입이 그대로 새 나가면 런타임 교체가 막힌다.
    expect(result?.detections[0]).not.toHaveProperty("categories");
    expect(result?.detections[0]?.box).not.toHaveProperty("angle");
  });

  it("라벨이나 bbox가 없는 검출은 버린다", async () => {
    const handle = fakeHandle({
      detections: [
        {
          categories: [{ score: 0.9 }],
          boundingBox: { originX: 0, originY: 0, width: 1, height: 1 },
        },
        { categories: [{ categoryName: "person", score: 0.9 }] },
        { categories: [] },
      ],
    });
    const { loadRuntime } = fakeRuntime(async () => handle);
    const detector = createObjectDetector({ loadRuntime });
    await detector.load();

    expect(detector.detect(video, 0)?.detections).toEqual([]);
  });

  it("detectForVideo가 던져도 던지지 않고 null을 돌려준다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const handle = fakeHandle();
    handle.detectForVideo.mockImplementation(() => {
      throw new Error("GPU context lost");
    });
    const { loadRuntime } = fakeRuntime(async () => handle);
    const detector = createObjectDetector({ loadRuntime });
    await detector.load();

    expect(detector.detect(video, 0)).toBeNull();
    expect(detector.state).toBe("ready"); // 한 번 실패로 감지를 포기하지 않는다
  });

  it("연속 실패가 쌓이면 감지 불가로 내려간다 — 조용히 null만 흘리지 않는다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const handle = fakeHandle();
    handle.detectForVideo.mockImplementation(() => {
      throw new Error("GPU context lost");
    });
    const { loadRuntime } = fakeRuntime(async () => handle);
    const detector = createObjectDetector({ loadRuntime });
    await detector.load();

    for (let i = 0; i < 10; i += 1) {
      detector.detect(video, i);
    }

    expect(detector.state).toBe("unavailable");
    expect(handle.close).toHaveBeenCalled();
  });
});

describe("resolveModelVariant", () => {
  it("쿼리가 없으면 기본 변형", () => {
    expect(resolveModelVariant("")).toBe(DEFAULT_MODEL_VARIANT);
  });

  it("?model=int8이면 int8 — 재빌드 없이 두 모델을 비교한다", () => {
    expect(resolveModelVariant("?model=int8")).toBe("int8");
    expect(resolveModelVariant("?model=fp32")).toBe("fp32");
  });

  it("모르는 값은 무시하고 기본 변형으로 떨어진다", () => {
    expect(resolveModelVariant("?model=int4")).toBe(DEFAULT_MODEL_VARIANT);
    expect(resolveModelVariant("?other=int8")).toBe(DEFAULT_MODEL_VARIANT);
  });

  it("고른 변형의 모델 경로로 detector를 만든다", async () => {
    const { loadRuntime, createDetector } = fakeRuntime(async () => fakeHandle());
    const detector = createObjectDetector({ loadRuntime, modelVariant: "int8" });

    await detector.load();

    expect(detector.modelVariant).toBe("int8");
    expect(createDetector.mock.calls[0]?.[0]).toMatchObject({
      modelAssetPath: MODEL_PATHS.int8,
    });
  });
});
