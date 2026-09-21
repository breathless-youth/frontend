import { afterEach, describe, expect, it, vi } from "vitest";

import type * as sentryLib from "@/lib/sentry";
import { reportHandled } from "@/lib/sentry";

import { createFaceLandmarker } from "../faceLandmarker";
import type {
  FaceLandmarkerCreateOptions,
  MediapipeFaceLandmarkerHandle,
  MediapipeFaceRuntime,
} from "../mediapipePort";
import {
  EAR_LANDMARKS,
  FACE_MODEL_PATH,
  HEAD_PITCH_DOWN_DEG,
  MEDIAPIPE_WASM_PATH,
  MIN_INTER_OCULAR_NORMALIZED,
} from "../visionConfig";

// 실패 경로가 Sentry로 가는지 검증한다 — partial mock이라 다른 export는 실제 그대로.
vi.mock("@/lib/sentry", async (importOriginal) => ({
  ...(await importOriginal<typeof sentryLib>()),
  reportHandled: vi.fn(),
}));

/** 눈 두 점만 의미 있는 랜드마크 배열. 33·263이 눈 바깥 꼬리다. */
function landmarks(interOcular: number) {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  points[33] = { x: 0.5 - interOcular / 2, y: 0.4 };
  points[263] = { x: 0.5 + interOcular / 2, y: 0.4 };
  return points;
}

function blendshapes(closure: number) {
  return [
    {
      categories: [
        { categoryName: "eyeBlinkLeft", score: closure },
        { categoryName: "eyeBlinkRight", score: closure },
        { categoryName: "eyeLookDownLeft", score: 0.1 },
        { categoryName: "eyeLookDownRight", score: 0.1 },
        { categoryName: "jawOpen", score: 0.3 },
      ],
    },
  ];
}

function faceResult(interOcular = 0.13, closure = 0.2) {
  return { faceLandmarks: [landmarks(interOcular)], faceBlendshapes: blendshapes(closure) };
}

const NO_FACE = { faceLandmarks: [], faceBlendshapes: [] };

/**
 * 순수 pitch 회전의 자세 행렬(열 우선 가정). 아래를 볼 때 `data[9]`가 −sin(각도)가 되도록 만든다 —
 * `headPitchDegOf`의 가정과 같은 배치라, 이 테스트는 "그 가정 아래에서 각도가 되살아난다"를 본다.
 */
function pitchMatrix(pitchDeg: number) {
  const radians = (pitchDeg * Math.PI) / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  // 열 우선: 열0=(1,0,0,0) 열1=(0,c,s,0) 열2=(0,-s,c,0) 열3=(0,0,0,1)
  return { rows: 4, columns: 4, data: [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1] };
}

/** 눈 6점씩을 EAR이 정확히 `ear`가 되도록 놓는다. 가로 0.06, 세로 짝 두 개가 같은 길이다. */
function withEyes(points: { x: number; y: number }[], ear: number, right = ear) {
  const place = (indexes: readonly number[], x0: number, value: number) => {
    const half = (value * 0.12) / 4;
    const [p1, p2, p3, p4, p5, p6] = indexes;
    points[p1!] = { x: x0, y: 0.4 };
    points[p4!] = { x: x0 + 0.06, y: 0.4 };
    points[p2!] = { x: x0 + 0.02, y: 0.4 - half };
    points[p6!] = { x: x0 + 0.02, y: 0.4 + half };
    points[p3!] = { x: x0 + 0.04, y: 0.4 - half };
    points[p5!] = { x: x0 + 0.04, y: 0.4 + half };
  };
  place(EAR_LANDMARKS.left, 0.38, ear);
  place(EAR_LANDMARKS.right, 0.56, right);
  return points;
}

function fakeHandle(result: unknown = faceResult()) {
  return {
    detectForVideo: vi.fn(() => result),
    close: vi.fn(),
  } as unknown as MediapipeFaceLandmarkerHandle & {
    detectForVideo: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
}

function fakeRuntime(create: (options: FaceLandmarkerCreateOptions) => Promise<unknown>) {
  const spy = vi.fn(create);
  const runtime = { createFaceLandmarker: spy } as unknown as MediapipeFaceRuntime;
  return { runtime, createFaceLandmarker: spy, loadRuntime: async () => runtime };
}

const video = {} as HTMLVideoElement;

/** 마이크로태스크를 전부 흘려보낸다 — "로딩이 실제로 진행 중인" 시점을 만들 때 쓴다. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** 폴백 기계를 검증할 때 쓰는 순서. 기본값 상수를 읽지 않는 이유는 `objectDetector.test.ts`와 같다. */
const TWO_DELEGATES = ["GPU", "CPU"] as const;

describe("createFaceLandmarker — 로딩", () => {
  it("설정한 옵션 그대로 만든다", async () => {
    const { loadRuntime, createFaceLandmarker: create } = fakeRuntime(async () => fakeHandle());
    const landmarker = createFaceLandmarker({ loadRuntime });

    await expect(landmarker.load()).resolves.toBe("ready");

    expect(landmarker.delegate).toBe("CPU");
    // 값을 리터럴로 적는다. 상수를 그대로 읽어 비교하면 상수를 바꿨을 때도 통과해서
    // "기본값이 바뀌었다"와 "옵션 전달이 깨졌다"를 구분할 수 없다.
    expect(create).toHaveBeenCalledWith({
      wasmPath: MEDIAPIPE_WASM_PATH,
      modelAssetPath: FACE_MODEL_PATH,
      delegate: "CPU",
      numFaces: 1,
      minFaceDetectionConfidence: 0.6,
      minFacePresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
  });

  it("delegate가 실패하면 다음 것으로 넘어간다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const handle = fakeHandle();
    const { loadRuntime, createFaceLandmarker: create } = fakeRuntime(async (options) => {
      if (options.delegate === "GPU") {
        throw new Error("WebGL context creation failed");
      }
      return handle;
    });
    const landmarker = createFaceLandmarker({ loadRuntime, delegateOrder: TWO_DELEGATES });

    await expect(landmarker.load()).resolves.toBe("ready");

    expect(landmarker.delegate).toBe("CPU");
    expect(create).toHaveBeenCalledTimes(2);
    expect(reportHandled).toHaveBeenCalledWith(expect.any(Error), "vision-face-create-gpu");
  });

  it("전부 실패해도 던지지 않고 unavailable로 남는다 — 1회 재시도 뒤", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { loadRuntime, createFaceLandmarker: create } = fakeRuntime(async () => {
      throw new Error("model fetch 404");
    });
    const landmarker = createFaceLandmarker({ loadRuntime });

    await expect(landmarker.load()).resolves.toBe("unavailable");

    expect(landmarker.delegate).toBeNull();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("런타임 모듈을 못 불러와도 던지지 않는다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const loadRuntime = vi.fn(async () => {
      throw new Error("Failed to fetch dynamically imported module");
    });
    const landmarker = createFaceLandmarker({ loadRuntime });

    await expect(landmarker.load()).resolves.toBe("unavailable");
    expect(reportHandled).toHaveBeenCalledWith(expect.any(Error), "vision-face-runtime-load");
  });

  it("동시 load 두 번이 한 번만 만든다", async () => {
    const { loadRuntime, createFaceLandmarker: create } = fakeRuntime(async () => fakeHandle());
    const landmarker = createFaceLandmarker({ loadRuntime });

    await Promise.all([landmarker.load(), landmarker.load()]);

    expect(create).toHaveBeenCalledTimes(1);
  });

  it("로딩 도중 close가 들어오면 뒤늦게 온 handle을 그 자리에서 닫는다", async () => {
    const handle = fakeHandle();
    let resolveCreate: (value: MediapipeFaceLandmarkerHandle) => void = () => {};
    const { loadRuntime } = fakeRuntime(
      () =>
        new Promise<MediapipeFaceLandmarkerHandle>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const landmarker = createFaceLandmarker({ loadRuntime });

    const loading = landmarker.load();
    await tick();
    landmarker.close();
    resolveCreate(handle);
    await loading;

    expect(handle.close).toHaveBeenCalledTimes(1);
    expect(landmarker.state).toBe("idle");
  });
});

describe("createFaceLandmarker — 정규화", () => {
  async function ready(result: unknown) {
    const handle = fakeHandle(result);
    const { loadRuntime } = fakeRuntime(async () => handle);
    const landmarker = createFaceLandmarker({ loadRuntime });
    await landmarker.load();
    return { landmarker, handle };
  }

  it("얼굴이 없으면 눈 판정도 없다", async () => {
    const { landmarker } = await ready(NO_FACE);

    expect(landmarker.detect(video, 0)?.face).toEqual({
      facePresent: false,
      eye: null,
      eyeSkipReason: "no-face",
    });
  });

  it("얼굴이 너무 작으면 눈 판정을 하지 않는다 — 얼굴은 있다고 남긴다", async () => {
    const tiny = MIN_INTER_OCULAR_NORMALIZED - 0.01;
    const { landmarker } = await ready(faceResult(tiny, 0.9));

    const face = landmarker.detect(video, 0)?.face;
    expect(face?.facePresent).toBe(true);
    expect(face?.eye).toBeNull();
    expect(face?.eyeSkipReason).toBe("face-too-small");
  });

  it("판정에 쓰는 점수 이름이 없으면 눈 판정을 하지 않고 빠진 이름을 한 번에 보고한다", async () => {
    const broken = {
      faceLandmarks: [landmarks(0.13)],
      faceBlendshapes: [{ categories: [{ categoryName: "jawOpen", score: 0.3 }] }],
    };
    const { landmarker } = await ready(broken);

    expect(landmarker.detect(video, 0)?.face.eyeSkipReason).toBe("blendshapes-missing");
    landmarker.detect(video, 1);
    landmarker.detect(video, 2);

    // 이름이 바뀌면 눈 규칙이 알림 없이 죽는다. 다만 프레임마다 보내면 한 세션이 수백 건을 만든다.
    const reports = vi
      .mocked(reportHandled)
      .mock.calls.filter(([, tag]) => tag === "vision-face-blendshape-missing");
    expect(reports).toHaveLength(1);
    // 빠진 이름이 전부 실려야 한다. 하나만 보내면 여러 개가 바뀌었을 때 절반만 보인다.
    const message = (reports[0]?.[0] as Error).message;
    expect(message).toContain("eyeBlinkLeft");
    expect(message).toContain("eyeBlinkRight");
  });

  it("진단용 점수만 없으면 눈 판정을 계속한다 — 그 이름 때문에 감지가 죽지 않는다", async () => {
    const partial = {
      faceLandmarks: [landmarks(0.13)],
      faceBlendshapes: [
        {
          categories: [
            { categoryName: "eyeBlinkLeft", score: 0.6 },
            { categoryName: "eyeBlinkRight", score: 0.62 },
          ],
        },
      ],
    };
    const { landmarker } = await ready(partial);

    const face = landmarker.detect(video, 0)?.face;
    expect(face?.eyeSkipReason).toBeNull();
    expect(face?.eye).toEqual({ eyeBlinkLeft: 0.6, eyeBlinkRight: 0.62 });
    expect(reportHandled).not.toHaveBeenCalled();
  });

  it("고개를 기울여도 얼굴 크기 게이트에 걸리지 않는다 — 가로 성분만 재면 졸 때 놓친다", async () => {
    // 두 눈 사이 거리는 0.13 그대로인데 45도 기울인 배치. 가로 성분만 재면 0.092로 줄어든다.
    const tilted = 0.13 / Math.SQRT2;
    const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
    points[33] = { x: 0.5 - tilted / 2, y: 0.5 - tilted / 2 };
    points[263] = { x: 0.5 + tilted / 2, y: 0.5 + tilted / 2 };
    const { landmarker } = await ready({
      faceLandmarks: [points],
      faceBlendshapes: blendshapes(0.6),
    });

    expect(landmarker.detect(video, 0)?.face.eyeSkipReason).toBeNull();
  });

  it("allowlist 점수만 남기고 좌표는 넘기지 않는다", async () => {
    const { landmarker, handle } = await ready(faceResult(0.13, 0.55));

    const result = landmarker.detect(video, 1234);

    expect(handle.detectForVideo).toHaveBeenCalledWith(video, 1234);
    expect(result?.face.eye).toEqual({
      eyeBlinkLeft: 0.55,
      eyeBlinkRight: 0.55,
      eyeLookDownLeft: 0.1,
      eyeLookDownRight: 0.1,
    });
    expect(typeof result?.durationMs).toBe("number");

    // 좌표가 한 겹이라도 새 나가면 개인정보 원칙이 깨진다.
    const serialized = JSON.stringify(result);
    for (const key of ["faceLandmarks", "landmarks", "matrix", '"x"', '"y"', "interOcular"]) {
      expect(serialized).not.toContain(key);
    }
  });
});

describe("createFaceLandmarker — 눈 윤곽 그리기 통로", () => {
  it("얼굴이 있으면 눈 윤곽 16점씩을 콜백으로만 넘기고 반환값에는 남기지 않는다", async () => {
    const outlines: unknown[] = [];
    const { loadRuntime } = fakeRuntime(async () => fakeHandle(faceResult(0.13, 0.55)));
    const landmarker = createFaceLandmarker({
      loadRuntime,
      onEyeOutline: (outline) => outlines.push(outline),
    });
    await landmarker.load();

    const result = landmarker.detect(video, 0);

    expect(outlines).toHaveLength(1);
    expect(outlines[0]).toMatchObject({ accepted: true });
    expect((outlines[0] as { left: unknown[] }).left).toHaveLength(16);
    expect((outlines[0] as { right: unknown[] }).right).toHaveLength(16);
    expect(JSON.stringify(result)).not.toContain('"x"');
  });

  it("얼굴은 있는데 게이트에 걸리면 받아들이지 않았다고 표시한다", async () => {
    const outlines: { accepted: boolean }[] = [];
    const { loadRuntime } = fakeRuntime(async () => fakeHandle(faceResult(0.02, 0.55)));
    const landmarker = createFaceLandmarker({
      loadRuntime,
      onEyeOutline: (outline) => {
        if (outline !== null) {
          outlines.push(outline);
        }
      },
    });
    await landmarker.load();

    landmarker.detect(video, 0);

    expect(outlines[0]?.accepted).toBe(false);
  });

  it("얼굴이 없으면 null을 넘겨 그림을 지우게 한다", async () => {
    const outlines: unknown[] = [];
    const { loadRuntime } = fakeRuntime(async () => fakeHandle(NO_FACE));
    const landmarker = createFaceLandmarker({
      loadRuntime,
      onEyeOutline: (outline) => outlines.push(outline),
    });
    await landmarker.load();

    landmarker.detect(video, 0);

    expect(outlines).toEqual([null]);
  });
});

describe("createFaceLandmarker — 추론 실패", () => {
  it("ready 이전에는 null이다", () => {
    const { loadRuntime } = fakeRuntime(async () => fakeHandle());
    const landmarker = createFaceLandmarker({ loadRuntime });

    expect(landmarker.detect(video, 0)).toBeNull();
  });

  it("한 번 던져도 감지를 포기하지 않는다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const handle = fakeHandle();
    handle.detectForVideo.mockImplementation(() => {
      throw new Error("GPU context lost");
    });
    const { loadRuntime } = fakeRuntime(async () => handle);
    const landmarker = createFaceLandmarker({ loadRuntime });
    await landmarker.load();

    expect(landmarker.detect(video, 0)).toBeNull();
    expect(landmarker.state).toBe("ready");
  });

  it("close 이후에는 null이고, 다시 load하면 새 모델로 복구된다", async () => {
    const first = fakeHandle();
    const second = fakeHandle();
    let created = 0;
    const { loadRuntime } = fakeRuntime(async () => {
      created += 1;
      return created === 1 ? first : second;
    });
    const landmarker = createFaceLandmarker({ loadRuntime });

    await landmarker.load();
    landmarker.close();

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(landmarker.state).toBe("idle");
    expect(landmarker.detect(video, 0)).toBeNull();

    await landmarker.load();
    expect(landmarker.state).toBe("ready");
    expect(landmarker.detect(video, 0)).not.toBeNull();
  });

  it("연속 실패가 쌓이면 감지 불가로 내려가고 한 번만 보고한다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const handle = fakeHandle();
    handle.detectForVideo.mockImplementation(() => {
      throw new Error("GPU context lost");
    });
    const { loadRuntime } = fakeRuntime(async () => handle);
    const landmarker = createFaceLandmarker({ loadRuntime });
    await landmarker.load();

    for (let i = 0; i < 10; i += 1) {
      landmarker.detect(video, i);
    }

    expect(landmarker.state).toBe("unavailable");
    expect(handle.close).toHaveBeenCalled();
    const reports = vi
      .mocked(reportHandled)
      .mock.calls.filter(([, tag]) => tag === "vision-face-frame-loop");
    expect(reports).toHaveLength(1);
  });
});

describe("내려다봄 게이트와 얼굴 지표", () => {
  async function ready(result: unknown) {
    const handle = fakeHandle(result);
    const { loadRuntime } = fakeRuntime(async () => handle);
    const landmarker = createFaceLandmarker({ loadRuntime });
    await landmarker.load();
    return { landmarker, handle };
  }

  it("고개를 게이트 이상 숙이면 눈 판정을 하지 않고 looking-down으로 남긴다 — 얼굴은 있다", async () => {
    const { landmarker } = await ready({
      ...faceResult(0.13, 0.9),
      facialTransformationMatrixes: [pitchMatrix(HEAD_PITCH_DOWN_DEG + 15)],
    });

    const result = landmarker.detect(video, 0);
    expect(result?.face).toEqual({ facePresent: true, eye: null, eyeSkipReason: "looking-down" });
    // 게이트에 걸린 관측에서도 각도는 넘긴다 — 그게 게이트 값을 정하는 자료다.
    expect(result?.metrics.headPitchDeg).toBeCloseTo(HEAD_PITCH_DOWN_DEG + 15, 0);
  });

  it("고개가 서 있으면 게이트에 걸리지 않고 각도만 넘긴다", async () => {
    const { landmarker } = await ready({
      ...faceResult(0.13, 0.9),
      facialTransformationMatrixes: [pitchMatrix(10)],
    });

    const result = landmarker.detect(video, 0);
    expect(result?.face.eye).toEqual({
      eyeBlinkLeft: 0.9,
      eyeBlinkRight: 0.9,
      eyeLookDownLeft: 0.1,
      eyeLookDownRight: 0.1,
    });
    expect(result?.metrics.headPitchDeg).toBeCloseTo(10, 0);
  });

  it("자세 행렬이 없으면 게이트 없이 예전처럼 판정한다", async () => {
    const { landmarker } = await ready(faceResult(0.13, 0.9));

    const result = landmarker.detect(video, 0);
    expect(result?.face.eyeSkipReason).toBeNull();
    expect(result?.metrics.headPitchDeg).toBeNull();
  });

  it("얼굴 크기 게이트가 내려다봄 게이트보다 먼저다 — 멀면 각도와 무관하게 face-too-small", async () => {
    const { landmarker } = await ready({
      ...faceResult(MIN_INTER_OCULAR_NORMALIZED - 0.01, 0.9),
      facialTransformationMatrixes: [pitchMatrix(HEAD_PITCH_DOWN_DEG + 15)],
    });

    expect(landmarker.detect(video, 0)?.face.eyeSkipReason).toBe("face-too-small");
  });

  it("EAR은 두 눈 중 큰 쪽(덜 감긴 쪽)이다 — 판정이 두 눈 중 덜 감긴 쪽을 보는 것과 같은 방향", async () => {
    const points = withEyes(landmarks(0.13), 0.3, 0.1);
    const { landmarker } = await ready({
      faceLandmarks: [points],
      faceBlendshapes: blendshapes(0.2),
    });

    expect(landmarker.detect(video, 0)?.metrics.ear).toBeCloseTo(0.3, 2);
  });

  it("눈 점이 겹쳐 가로 길이가 0이면 EAR을 내지 않는다", async () => {
    const { landmarker } = await ready(faceResult(0.13, 0.2));
    // 기본 픽스처는 33·263 말고는 전부 (0.5, 0.5)라 세로 짝은 0이고 가로는 0이 아니다 → EAR 0.
    expect(landmarker.detect(video, 0)?.metrics.ear).toBe(0);

    const collapsed = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
    collapsed[33] = { x: 0.435, y: 0.4 };
    collapsed[263] = { x: 0.565, y: 0.4 };
    collapsed[133] = { x: 0.435, y: 0.4 }; // 왼눈 p4를 p1과 겹친다
    const { landmarker: other } = await ready({
      faceLandmarks: [collapsed],
      faceBlendshapes: blendshapes(0.2),
    });
    expect(other.detect(video, 0)?.metrics.ear).toBeNull();
  });

  it("얼굴이 없으면 지표도 없다", async () => {
    const { landmarker } = await ready(NO_FACE);
    expect(landmarker.detect(video, 0)?.metrics).toEqual({ headPitchDeg: null, ear: null });
  });

  it("행렬·각도·EAR 어느 것도 좌표를 반환값에 싣지 않는다", async () => {
    const { landmarker } = await ready({
      ...faceResult(0.13, 0.9),
      facialTransformationMatrixes: [pitchMatrix(10)],
    });
    const text = JSON.stringify(landmarker.detect(video, 0));
    for (const key of ["data", "rows", "columns", 'x"', 'y"', "landmark"]) {
      expect(text).not.toContain(key);
    }
  });
});
