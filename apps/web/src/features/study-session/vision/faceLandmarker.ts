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
  EAR_LANDMARKS,
  EYE_OUTER_CORNER_LANDMARKS,
  EYE_OUTLINE_LANDMARKS,
  FACE_BLENDSHAPE_ALLOWLIST,
  FACE_BLENDSHAPE_REQUIRED,
  FACE_LANDMARKER_OPTIONS,
  FACE_MODEL_PATH,
  HEAD_PITCH_DOWN_DEG,
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
 * 둘 다 좌표에서 계산되지만 좌표가 아니다 — 각도 하나와 비율 하나다. 눈 점수와 같은 급으로
 * 다룬다(`frontend/CLAUDE.md`가 금지하는 것은 원본 프레임·얼굴 이미지·랜드마크 좌표다).
 */
export interface FaceMetrics {
  /** 고개 숙임 각도(도). 아래를 볼 때 양수가 되도록 계산한다. 자세 행렬이 없으면 null. */
  readonly headPitchDeg: number | null;
  /** 두 눈 EAR 중 큰 쪽(덜 감긴 쪽). 뜬 눈 0.25~0.35, 감은 눈 0.15 미만이 문헌값. 점이 없으면 null. */
  readonly ear: number | null;
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

/** 화면에 그리기 위한 눈 윤곽. 정규화 좌표(0~1)이고 반환값이 아니라 콜백으로만 나간다. */
export interface EyeOutline {
  readonly left: readonly { readonly x: number; readonly y: number }[];
  readonly right: readonly { readonly x: number; readonly y: number }[];
  /** 이 관측의 눈 점수를 판정이 받아들였는가. 얼굴은 찾았는데 게이트에서 걸렸으면 false다. */
  readonly accepted: boolean;
}

export interface CreateFaceLandmarkerOptions {
  /** 테스트·워커 이전용 주입점. 기본값은 `./mediapipeModule.ts`를 동적으로 로드한다. */
  readonly loadRuntime?: () => Promise<MediapipeFaceRuntime>;
  /** 시도할 delegate 순서. 기본값은 `DELEGATE_ORDER`. 주입점을 여는 이유는 객체 래퍼와 같다. */
  readonly delegateOrder?: readonly Delegate[];
  /**
   * 실기기 측정 도구가 눈 자리를 프리뷰 위에 그리기 위한 통로. 측정이 끝나면 지운다.
   *
   * 좌표가 래퍼 밖으로 나가는 유일한 길이고, 받는 쪽은 단말 화면의 캔버스에 그리고 버린다.
   * 진단·덩어리·로그로는 절대 가지 않는다 — 그쪽은 타입이 스칼라만 받는다. 얼굴이 없으면
   * null을 넘겨 그림을 지우게 한다.
   */
  readonly onEyeOutline?: (outline: EyeOutline | null) => void;
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
const LOOKING_DOWN: FaceObservation = {
  facePresent: true,
  eye: null,
  eyeSkipReason: "looking-down",
};
const NO_METRICS: FaceMetrics = { headPitchDeg: null, ear: null };

type Point = MediapipeFaceResult["faceLandmarks"][number][number];

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * 자세 행렬 → 고개 숙임 각도(도). 행렬은 여기서 각도 하나로 줄어들고 밖으로 나가지 않는다.
 *
 * 순수 pitch 회전 Rx(φ)에서 얼굴 정면 벡터의 y성분은 −sin φ이고, 그 값은 열 우선 배치면
 * `data[9]`, 행 우선이면 `data[6]`(부호 반대)에 있다. MediaPipe JS의 `Matrix.data` 배치가
 * 문서화돼 있지 않아 **열 우선(C++ Eigen 기본)으로 가정**했다. 틀렸으면 아래를 볼 때 음수가
 * 나오고, 그때는 이 함수의 부호만 뒤집는다(`HEAD_PITCH_DOWN_DEG` 주석).
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

/** 한쪽 눈의 EAR. 가로 길이가 0이면(점이 겹치면) 계산하지 않는다. */
function earOfEye(landmarks: readonly Point[], indexes: readonly number[]): number | null {
  const points = indexes.map((index) => landmarks[index]);
  if (points.some((point) => point === undefined)) {
    return null;
  }
  const [p1, p2, p3, p4, p5, p6] = points as Point[];
  const horizontal = distance(p1, p4);
  if (horizontal < 1e-6) {
    return null;
  }
  return (distance(p2, p6) + distance(p3, p5)) / (2 * horizontal);
}

/** 두 눈 EAR 중 큰 쪽. 판정이 두 눈 중 덜 감긴 쪽을 보는 것과 같은 방향이다. */
export function earOf(landmarks: readonly Point[]): number | null {
  const left = earOfEye(landmarks, EAR_LANDMARKS.left);
  const right = earOfEye(landmarks, EAR_LANDMARKS.right);
  if (left === null || right === null) {
    return null;
  }
  return round(Math.max(left, right), 3);
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
  const onEyeOutline = options.onEyeOutline;

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
    if (onEyeOutline !== undefined) {
      emitEyeOutline(raw, observation);
    }
    return { face: observation, metrics: metricsOf(raw) };
  }

  /** 얼굴이 있으면 각도와 EAR을 뽑는다. 게이트에 걸린 관측에서도 뽑는다 — 그게 게이트를 튜닝할 자료다. */
  function metricsOf(raw: MediapipeFaceResult): FaceMetrics {
    const landmarks = raw.faceLandmarks[0];
    if (landmarks === undefined || landmarks.length === 0) {
      return NO_METRICS;
    }
    return { headPitchDeg: headPitchDegOf(raw), ear: earOf(landmarks) };
  }

  /** 그리기용 윤곽만 뽑아 넘긴다. 점이 모자라면 얼굴 없음과 같이 지운다. */
  function emitEyeOutline(raw: MediapipeFaceResult, observation: FaceObservation): void {
    const landmarks = raw.faceLandmarks[0];
    if (landmarks === undefined || landmarks.length === 0 || onEyeOutline === undefined) {
      onEyeOutline?.(null);
      return;
    }
    const pick = (indexes: readonly number[]) =>
      indexes.flatMap((index) => {
        const point = landmarks[index];
        return point === undefined ? [] : [{ x: point.x, y: point.y }];
      });
    const left = pick(EYE_OUTLINE_LANDMARKS.left);
    const right = pick(EYE_OUTLINE_LANDMARKS.right);
    if (left.length === 0 || right.length === 0) {
      onEyeOutline(null);
      return;
    }
    onEyeOutline({ left, right, accepted: observation.eye !== null });
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

    // 내려다봄 게이트. 고개가 숙여진 동안의 눈 점수는 감김과 갈리지 않으므로 판정에서 뺀다.
    // 자세 행렬이 없으면(옛 런타임·픽스처) 게이트 없이 예전처럼 간다.
    const headPitchDeg = headPitchDegOf(raw);
    if (headPitchDeg !== null && headPitchDeg >= HEAD_PITCH_DOWN_DEG) {
      return LOOKING_DOWN;
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
