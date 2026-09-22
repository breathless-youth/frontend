import { reportHandled } from "@/lib/sentry";

import type {
  MediapipeFaceLandmarkerHandle,
  MediapipeFaceRuntime,
  MediapipeFaceResult,
} from "./mediapipePort";
import type { DetectorState } from "./objectDetector";
import type { EyeScores, FaceObservation } from "./sleepRules";
import type { Delegate, EyeBlendshapeName } from "./visionConfig";
import {
  DELEGATE_ORDER,
  EYE_OUTER_CORNER_LANDMARKS,
  FACE_BLENDSHAPE_ALLOWLIST,
  FACE_BLENDSHAPE_REQUIRED,
  FACE_LANDMARKER_OPTIONS,
  FACE_MODEL_PATH,
  MEDIAPIPE_WASM_PATH,
  MIN_INTER_OCULAR_NORMALIZED,
} from "./visionConfig";

/**
 * MediaPipe `FaceLandmarker` 래퍼 — 객체 검출 래퍼와 같은 계약이다.
 *
 * `load()`는 던지지 않고 최종 상태를 돌려준다. `detect()`는 준비되지 않았거나 실패하면 `null`이고,
 * 호출부는 그것을 "이번 프레임 판정 없음"으로 다룬다. 얼굴 모델을 못 받아도 자리 이탈·휴대폰
 * 판정은 그대로 돌아야 하므로, 이 파일의 어떤 실패도 위로 던지지 않는다.
 *
 * **정규화가 이 파일의 두 번째 일이다.** 랜드마크 478점과 blendshape 52개가 이 경계를 넘지 않는다.
 * 눈 간격은 품질 게이트를 계산하고 즉시 버린다 — 크기와 거리는 좌표와 같은 성격의 위치 정보다.
 */

/**
 * 얼굴에서 뽑은 스칼라 지표. 진단·측정 도구가 쓰고 판정은 `face`만 본다.
 *
 * 2026-09-22 BY-704 측정에서 EAR·내려다봄 점수·눈 영역 화소 대비도 여기 있었다가 전부 뺐다 —
 * 카메라가 눈을 위에서 보는 자세에서는 어느 것도 뜬 눈과 감은 눈을 가르지 못했다(스펙 기록).
 * 고개 각도만 남긴다. 좌표에서 계산되지만 좌표가 아니라 각도 하나다.
 */
export interface FaceMetrics {
  /** 고개 숙임 각도(도). 아래를 볼 때 양수, 카메라 기준 상대각. 자세 행렬이 없으면 null. */
  readonly headPitchDeg: number | null;
}

export interface FaceDetectionResult {
  readonly face: FaceObservation;
  /** 이 프레임의 추론 소요시간(ms). 진단 로그가 쓴다. */
  readonly durationMs: number;
  readonly metrics: FaceMetrics;
}

export interface VisionFaceLandmarker {
  readonly state: DetectorState;
  /** 어느 delegate로 떨어졌는가. `ready`가 아니면 null. */
  readonly delegate: Delegate | null;
  /** **던지지 않는다.** 최종 상태를 돌려준다. 여러 번 불러도 하나만 만든다. */
  load(): Promise<DetectorState>;
  /** 준비되지 않았거나 추론이 실패하면 `null` — 호출부는 "이번 프레임 판정 없음"으로 다룬다. */
  detect(video: HTMLVideoElement, timestampMs: number): FaceDetectionResult | null;
  /** 멱등. 로딩 중에 불러도 안전하다. */
  close(): void;
}

export interface CreateFaceLandmarkerOptions {
  /** 테스트·워커 이전용 주입점. 기본값은 `./mediapipeModule.ts`를 동적으로 로드한다. */
  readonly loadRuntime?: () => Promise<MediapipeFaceRuntime>;
  /** 시도할 delegate 순서. 기본값은 `DELEGATE_ORDER`. 주입점을 여는 이유는 객체 래퍼와 같다. */
  readonly delegateOrder?: readonly Delegate[];
}

/**
 * `detectForVideo`가 연속으로 이만큼 던지면 감지 불가로 내린다.
 * 객체 래퍼와 같은 값이고 같은 이유다 — 한 번의 실패로 포기하지 않되, 무한히 `null`만 흘리지도
 * 않는다. 근거 있는 값이 아니라서 `visionConfig.ts`에 올리지 않았다.
 */
const MAX_CONSECUTIVE_DETECT_FAILURES = 5;

const NO_FACE: FaceObservation = { facePresent: false, eye: null, eyeSkipReason: "no-face" };
const FACE_TOO_SMALL: FaceObservation = {
  facePresent: true,
  eye: null,
  eyeSkipReason: "face-too-small",
};
const BLENDSHAPES_MISSING: FaceObservation = {
  facePresent: true,
  eye: null,
  eyeSkipReason: "blendshapes-missing",
};
const NO_METRICS: FaceMetrics = { headPitchDeg: null };

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * 자세 행렬 → 고개 숙임 각도(도). 행렬은 여기서 각도 하나로 줄어들고 밖으로 나가지 않는다.
 *
 * 순수 pitch 회전 Rx(φ)에서 얼굴 정면 벡터의 y성분은 −sin φ이고, 그 값은 열 우선 배치면
 * `data[9]`, 행 우선이면 `data[6]`(부호 반대)에 있다. 열 우선(C++ Eigen 기본)으로 가정했고,
 * 2026-09-22 실기기에서 아래를 볼 때 양수로 확인됐다. 판정에는 쓰지 않는다 — 덩어리에서 자세를
 * 해석하는 참고값이다.
 */
export function headPitchDegOf(raw: MediapipeFaceResult): number | null {
  const matrix = raw.facialTransformationMatrixes?.[0];
  if (matrix === undefined || matrix.rows !== 4 || matrix.columns !== 4) {
    return null;
  }
  const forwardY = matrix.data[9];
  if (forwardY === undefined || !Number.isFinite(forwardY)) {
    return null;
  }
  const clamped = Math.max(-1, Math.min(1, forwardY));
  return round((-Math.asin(clamped) * 180) / Math.PI, 1);
}

async function defaultLoadRuntime(): Promise<MediapipeFaceRuntime> {
  // 정적 import가 아니라 동적 import인 것이 핵심이다 — 세션에 들어갈 때까지 wasm을 받지 않는다.
  const module = await import("./mediapipeModule");
  return module.createMediapipeRuntime();
}

interface OpenedLandmarker {
  readonly handle: MediapipeFaceLandmarkerHandle;
  readonly delegate: Delegate;
}

export function createFaceLandmarker(
  options: CreateFaceLandmarkerOptions = {},
): VisionFaceLandmarker {
  const loadRuntime = options.loadRuntime ?? defaultLoadRuntime;
  const delegateOrder = options.delegateOrder ?? DELEGATE_ORDER;

  let state: DetectorState = "idle";
  let handle: MediapipeFaceLandmarkerHandle | null = null;
  let delegate: Delegate | null = null;
  let consecutiveFailures = 0;
  /** 진행 중인 로딩 하나. 없으면 동시 `load()`가 서로를 보지 못해 모델이 두 개 열린다. */
  let pending: Promise<OpenedLandmarker | null> | null = null;
  /** "모델을 들고 있을 의도가 있는가". `close()`가 내리므로 로딩 중 이탈도 정리된다. */
  let wanted = false;
  /**
   * 점수 이름 누락을 이미 보고했는가.
   *
   * 이름이 바뀌면 눈 규칙이 아무 소리 없이 죽으므로 반드시 알려야 하는데, 프레임마다 보내면
   * 한 세션이 수백 건을 만든다. `close()` 뒤 다시 `load()`해도 이 값은 유지된다 — 모델이 바뀐 게
   * 아니라 같은 모델의 같은 이름이므로 두 번 알릴 이유가 없다.
   */
  let blendshapeMissingReported = false;

  /**
   * MediaPipe 결과 → 우리 타입. 좌표는 여기서 끝난다.
   *
   * 눈 판정을 건너뛰는 세 가지 이유를 구분해 남기는 것은 진단용이다. 셋 다 판정 결과는 같다 —
   * "이번 관측에 눈 판정 없음"이고, "눈을 떴다"가 아니다.
   */
  function normalize(raw: MediapipeFaceResult): {
    face: FaceObservation;
    metrics: FaceMetrics;
  } {
    const observation = normalizeObservation(raw);
    return { face: observation, metrics: metricsOf(raw) };
  }

  /** 얼굴이 있으면 고개 각도를 뽑는다. 내려다봄 게이트가 읽는다. */
  function metricsOf(raw: MediapipeFaceResult): FaceMetrics {
    const landmarks = raw.faceLandmarks[0];
    if (landmarks === undefined || landmarks.length === 0) {
      return NO_METRICS;
    }
    return { headPitchDeg: headPitchDegOf(raw) };
  }

  function normalizeObservation(raw: MediapipeFaceResult): FaceObservation {
    const landmarks = raw.faceLandmarks[0];
    if (landmarks === undefined || landmarks.length === 0) {
      return NO_FACE;
    }

    const left = landmarks[EYE_OUTER_CORNER_LANDMARKS.left];
    const right = landmarks[EYE_OUTER_CORNER_LANDMARKS.right];
    if (left === undefined || right === undefined) {
      return FACE_TOO_SMALL;
    }
    // 두 점 사이의 실제 거리를 쓴다. 가로 성분만 쓰면 고개를 기울인 각도의 cos만큼 값이 줄어서,
    // 하필 졸 때의 자세에서 얼굴이 작아지지도 않았는데 게이트에 걸려 눈 판정이 통째로 빠진다.
    // 이 값은 즉시 버린다. 크기는 좌표와 같은 성격이라 반환값에 담지 않는다.
    const interOcular = Math.hypot(left.x - right.x, left.y - right.y);
    if (interOcular < MIN_INTER_OCULAR_NORMALIZED) {
      return FACE_TOO_SMALL;
    }

    const categories = raw.faceBlendshapes[0]?.categories ?? [];
    const scores: Partial<Record<EyeBlendshapeName, number>> = {};
    for (const category of categories) {
      const name = category.categoryName;
      if (name !== undefined && (FACE_BLENDSHAPE_ALLOWLIST as readonly string[]).includes(name)) {
        scores[name as EyeBlendshapeName] = category.score;
      }
    }

    const missing = FACE_BLENDSHAPE_REQUIRED.filter((name) => scores[name] === undefined);
    if (missing.length > 0) {
      if (!blendshapeMissingReported) {
        blendshapeMissingReported = true;
        // 빠진 이름을 한 번에 싣는다. 처음 하나만 보내면 여러 개가 바뀌었을 때 절반만 보인다.
        reportHandled(
          new Error(`face blendshapes not found: ${missing.join(", ")}`),
          "vision-face-blendshape-missing",
        );
      }
      return BLENDSHAPES_MISSING;
    }

    return {
      facePresent: true,
      eye: scores as EyeScores,
      eyeSkipReason: null,
    };
  }

  async function openOnce(): Promise<OpenedLandmarker | null> {
    let runtime: MediapipeFaceRuntime;
    try {
      runtime = await loadRuntime();
    } catch (error: unknown) {
      // 이 실패는 그 세션이 통째로 졸음 감지 없이 간다는 뜻이다.
      reportHandled(error, "vision-face-runtime-load");
      return null;
    }
    if (!wanted) {
      return null;
    }

    for (const candidate of delegateOrder) {
      if (!wanted) {
        return null;
      }
      try {
        const opened = await runtime.createFaceLandmarker({
          wasmPath: MEDIAPIPE_WASM_PATH,
          modelAssetPath: FACE_MODEL_PATH,
          delegate: candidate,
          ...FACE_LANDMARKER_OPTIONS,
        });
        return { handle: opened, delegate: candidate };
      } catch (error: unknown) {
        reportHandled(error, `vision-face-create-${candidate.toLowerCase()}`);
      }
    }
    return null;
  }

  async function open(): Promise<OpenedLandmarker | null> {
    const first = await openOnce();
    if (first !== null || !wanted) {
      return first;
    }
    // 1회 재시도. 로딩 실패는 모델 fetch 타이밍처럼 일시적인 경우가 있다.
    return await openOnce();
  }

  function releaseHandle(): void {
    handle?.close();
    handle = null;
    delegate = null;
    consecutiveFailures = 0;
  }

  return {
    get state() {
      return state;
    },
    get delegate() {
      return delegate;
    },

    async load(): Promise<DetectorState> {
      wanted = true;
      if (state === "ready") {
        return state;
      }
      if (pending !== null) {
        await pending;
        return state;
      }

      state = "loading";
      pending = open();
      const opened = await pending;
      pending = null;

      if (opened === null) {
        if (wanted) {
          state = "unavailable";
        }
        return state;
      }
      if (!wanted) {
        // 모델을 받는 동안 세션을 나갔다. 여기서 닫지 않으면 wasm 힙이 고아로 남는다.
        opened.handle.close();
        return state;
      }

      handle = opened.handle;
      delegate = opened.delegate;
      consecutiveFailures = 0;
      state = "ready";
      return state;
    },

    detect(video: HTMLVideoElement, timestampMs: number): FaceDetectionResult | null {
      if (state !== "ready" || handle === null) {
        return null;
      }
      const startedAt = performance.now();
      let raw: MediapipeFaceResult;
      try {
        raw = handle.detectForVideo(video, timestampMs);
      } catch (error: unknown) {
        consecutiveFailures += 1;
        console.warn(`[vision] 얼굴 detectForVideo 실패 (${consecutiveFailures}회 연속)`, error);
        if (consecutiveFailures >= MAX_CONSECUTIVE_DETECT_FAILURES) {
          reportHandled(error, "vision-face-frame-loop");
          releaseHandle();
          state = "unavailable";
        }
        return null;
      }
      consecutiveFailures = 0;
      const { face, metrics } = normalize(raw);
      return { face, metrics, durationMs: performance.now() - startedAt };
    },

    close(): void {
      wanted = false;
      releaseHandle();
      state = "idle";
    },
  };
}
