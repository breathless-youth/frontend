import type { Detection } from "./detectionRules";
import type { Delegate, ModelVariant } from "./visionConfig";
import {
  CATEGORY_ALLOWLIST,
  DEFAULT_MODEL_VARIANT,
  DELEGATE_ORDER,
  DETECTOR_SCORE_THRESHOLD,
  MEDIAPIPE_WASM_PATH,
  MODEL_PATHS,
} from "./visionConfig";

/**
 * MediaPipe `ObjectDetector` 래퍼 — **이 저장소에서 MediaPipe에 닿는 유일한 지점**이다.
 *
 * 다른 모듈이 `@mediapipe/tasks-vision`을 직접 import하지 않게 격리하는 것이 이 파일의 존재
 * 이유다(설계 §3). 스파이크 S3에서 끊김이 실측되면 **이 모듈만 워커 뒤로 옮긴다** — 그때
 * `detectionRules.ts`·`frameLoop.ts`·훅은 한 줄도 바뀌지 않는다.
 *
 * 격리는 두 층으로 되어 있다.
 *
 * 1. **타입** — `detectForVideo`의 반환을 우리 `Detection[]`로 정규화한다. MediaPipe 타입이
 *    상위 모듈로 새 나가면 나중에 런타임을 갈아끼울 때 그 타입을 쓰는 모든 파일이 막힌다.
 * 2. **모듈 로딩** — 실제 `import("@mediapipe/tasks-vision")`은 이 파일이 아니라
 *    `./mediapipeModule.ts`에 있고, 여기서는 **동적으로만** 부른다. 그래서 (a) 무거운 wasm
 *    번들이 세션에 들어갈 때까지 로드되지 않고, (b) 워커 이전 시 교체 대상이 그 파일 하나로
 *    좁혀지며, (c) 테스트가 포트(`MediapipeVisionRuntime`)만 주입해 실제 패키지 없이 돈다.
 *
 * **로딩 실패는 던지지 않는다.** `../adapters/mediaStreamCamera.ts`가 `getUserMedia` 실패를
 * 다루는 방식과 같은 계약이다 — 감지 불가는 예외가 아니라 정상 시나리오이고, 호출부가
 * `state`를 보고 판단한다. V1.0에서 그 판단은 "감지 없이 세션을 계속 진행"이다(2026-07-29
 * 리더 결정). 개발 빌드에서만 실패를 화면에 띄운다.
 */

/* ------------------------------------------------------------------ *
 * MediaPipe 포트 — 우리가 필요한 만큼만 선언한다.
 * 구현은 `./mediapipeModule.ts`, 테스트는 fake가 채운다.
 * ------------------------------------------------------------------ */

export interface MediapipeCategory {
  readonly categoryName?: string;
  readonly score: number;
}

export interface MediapipeBoundingBox {
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
}

export interface MediapipeRawDetection {
  readonly categories: readonly MediapipeCategory[];
  readonly boundingBox?: MediapipeBoundingBox;
}

export interface MediapipeDetectionResult {
  readonly detections: readonly MediapipeRawDetection[];
}

export interface MediapipeDetectorHandle {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): MediapipeDetectionResult;
  close(): void;
}

export interface DetectorCreateOptions {
  readonly wasmPath: string;
  readonly modelAssetPath: string;
  readonly delegate: Delegate;
  readonly categoryAllowlist: readonly string[];
  readonly scoreThreshold: number;
}

/**
 * MediaPipe를 감싼 최소 런타임. 클래스(`FilesetResolver`·`ObjectDetector`)를 그대로 노출하지
 * 않고 **"detector 하나 만들어 줘"** 로 좁힌 이유는, 워커 뒤로 옮길 때 이 인터페이스가
 * 그대로 메시지 계약이 되기 때문이다.
 */
export interface MediapipeVisionRuntime {
  createDetector(options: DetectorCreateOptions): Promise<MediapipeDetectorHandle>;
}

/* ------------------------------------------------------------------ *
 * 공개 타입
 * ------------------------------------------------------------------ */

/**
 * - `idle` — 아직 로드하지 않았거나 `close()`로 정리된 상태.
 * - `loading` — 로딩 중. 이 동안 `detect()`는 `null`이다.
 * - `ready` — 추론 가능.
 * - `unavailable` — **감지 불가.** 재시도까지 실패했다. 호출부는 이걸 보고 판단한다
 *   (예: 감지 없이 타이머만 돌리는 모드).
 */
export type DetectorState = "idle" | "loading" | "ready" | "unavailable";

export interface DetectionResult {
  readonly detections: readonly Detection[];
  /** 이 프레임의 추론 소요시간(ms). 설계 §8이 진단 로그에 남기도록 허용한 항목이다. */
  readonly durationMs: number;
}

export interface VisionObjectDetector {
  readonly state: DetectorState;
  /** 어느 delegate로 떨어졌는가. 진단 로그(§8)가 쓴다. `ready`가 아니면 null. */
  readonly delegate: Delegate | null;
  readonly modelVariant: ModelVariant;
  /** **던지지 않는다.** 최종 상태를 돌려준다. 여러 번 불러도 detector는 하나만 만든다. */
  load(): Promise<DetectorState>;
  /** 준비되지 않았거나 추론이 실패하면 `null` — 호출부는 "이번 프레임은 판정 없음"으로 다룬다. */
  detect(video: HTMLVideoElement, timestampMs: number): DetectionResult | null;
  /** 멱등. 로딩 중에 불러도 안전하다(뒤늦게 도착한 detector를 그 자리에서 닫는다). */
  close(): void;
}

export interface CreateObjectDetectorOptions {
  /** 테스트·워커 이전용 주입점. 기본값은 `./mediapipeModule.ts`를 동적으로 로드한다. */
  readonly loadRuntime?: () => Promise<MediapipeVisionRuntime>;
  /** 명시하지 않으면 DEV에서 `?model=` 쿼리를, 그 외에는 기본 변형을 쓴다. */
  readonly modelVariant?: ModelVariant;
  /**
   * 시도할 delegate 순서. 기본값은 `DELEGATE_ORDER`(현재 CPU 하나).
   *
   * 주입점을 여는 이유는 **폴백 기계와 그 기본값을 분리해서 검증하기 위해서다.** 기본값은
   * 실측에 따라 바뀌는 값이고(S3에서 GPU 우선 → CPU로 뒤집혔다), 폴백 로직 자체는 그와
   * 무관하게 계속 옳아야 한다. 테스트가 상수를 그대로 읽으면 상수를 바꿀 때마다 폴백
   * 테스트가 함께 깨지면서 **"기본값이 바뀌었다"와 "폴백이 깨졌다"를 구분할 수 없게 된다.**
   */
  readonly delegateOrder?: readonly Delegate[];
}

/**
 * `detectForVideo`가 연속으로 이만큼 던지면 감지 불가로 내린다.
 *
 * 한 번의 실패로 포기하지 않는 이유는 GPU 컨텍스트 일시 손실처럼 회복되는 경우가 있어서이고,
 * 무한히 `null`만 흘리지 않는 이유는 그러면 화면상 "계속 자리 이탈"로 보여 **조용히 틀리기**
 * 때문이다. 실측 근거가 없는 값이라 `visionConfig.ts`에 올리지 않았다 — S3에서 정해지면 옮긴다.
 */
const MAX_CONSECUTIVE_DETECT_FAILURES = 5;

function isModelVariant(value: string): value is ModelVariant {
  return Object.hasOwn(MODEL_PATHS, value);
}

/**
 * URL 쿼리로 모델 변형을 고른다 — **개발 빌드 전용**.
 *
 * 설계 §2가 int8·float32를 둘 다 번들에 넣고 실측 비교하라고 정했다(S3). 재빌드 없이
 * `?model=int8` / `?model=fp32`로 오가야 저조도에서 `person`을 놓치는 정도를 같은 조건에서
 * 비교할 수 있다. 프로덕션에서는 쿼리를 무시한다 — 사용자가 URL로 모델을 바꿀 이유가 없고,
 * WebView URL은 네이티브가 조립하므로 열어두면 오염 경로만 는다.
 */
export function resolveModelVariant(search: string): ModelVariant {
  if (!import.meta.env.DEV) {
    return DEFAULT_MODEL_VARIANT;
  }
  const requested = new URLSearchParams(search).get("model");
  return requested !== null && isModelVariant(requested) ? requested : DEFAULT_MODEL_VARIANT;
}

/** MediaPipe 결과 → 우리 타입. 라벨이나 bbox가 없는 검출은 버린다. */
function normalize(result: MediapipeDetectionResult): Detection[] {
  const detections: Detection[] = [];
  for (const raw of result.detections) {
    const box = raw.boundingBox;
    if (box === undefined) {
      // 좌표가 없으면 후속 규칙(박스 크기·이동량, 설계 §4)이 쓸 수 없다. 지금 규칙은 score만
      // 보므로 살려도 되지만, 규칙을 갈아끼운 뒤에야 "그때만 이상하게 동작"하는 종류의 버그가 된다.
      continue;
    }
    let label: string | null = null;
    let score = 0;
    for (const category of raw.categories) {
      if (category.categoryName !== undefined && (label === null || category.score > score)) {
        label = category.categoryName;
        score = category.score;
      }
    }
    if (label === null) {
      continue;
    }
    detections.push({
      label,
      score,
      box: {
        originX: box.originX,
        originY: box.originY,
        width: box.width,
        height: box.height,
      },
    });
  }
  return detections;
}

async function defaultLoadRuntime(): Promise<MediapipeVisionRuntime> {
  // 정적 import가 아니라 동적 import인 것이 핵심이다 — 위 주석의 격리 2층.
  const module = await import("./mediapipeModule");
  return module.createMediapipeRuntime();
}

interface OpenedDetector {
  readonly handle: MediapipeDetectorHandle;
  readonly delegate: Delegate;
}

export function createObjectDetector(
  options: CreateObjectDetectorOptions = {},
): VisionObjectDetector {
  const loadRuntime = options.loadRuntime ?? defaultLoadRuntime;
  const delegateOrder = options.delegateOrder ?? DELEGATE_ORDER;
  const modelVariant =
    options.modelVariant ??
    resolveModelVariant(typeof window === "undefined" ? "" : window.location.search);

  let state: DetectorState = "idle";
  let handle: MediapipeDetectorHandle | null = null;
  let delegate: Delegate | null = null;
  let consecutiveFailures = 0;
  /** 진행 중인 로딩 하나. 없으면 동시 `load()`가 서로를 보지 못해 detector가 두 개 열린다. */
  let pending: Promise<OpenedDetector | null> | null = null;
  /**
   * "검출기를 들고 있을 의도가 있는가". `close()`가 이 값을 내리므로, **모델을 받는 동안
   * 세션을 나가도** 뒤늦게 해결된 detector를 그 자리에서 닫을 수 있다.
   * `../adapters/mediaStreamCamera.ts`의 `wanted`와 같은 패턴이고, 여기서는 대가가 더 크다 —
   * 정리하지 않으면 GPU 컨텍스트와 wasm 힙이 고아로 남는다(브라우저가 컨텍스트 개수를 제한한다).
   */
  let wanted = false;

  async function openOnce(): Promise<OpenedDetector | null> {
    let runtime: MediapipeVisionRuntime;
    try {
      runtime = await loadRuntime();
    } catch (error: unknown) {
      console.warn("[vision] MediaPipe 런타임 로드 실패", error);
      return null;
    }
    if (!wanted) {
      return null;
    }

    // GPU 먼저, 실패하면 CPU. WebView에서 GPU delegate의 안정성이 검증되지 않았다(설계 §2).
    for (const candidate of delegateOrder) {
      if (!wanted) {
        return null;
      }
      try {
        const opened = await runtime.createDetector({
          wasmPath: MEDIAPIPE_WASM_PATH,
          modelAssetPath: MODEL_PATHS[modelVariant],
          delegate: candidate,
          categoryAllowlist: [...CATEGORY_ALLOWLIST],
          scoreThreshold: DETECTOR_SCORE_THRESHOLD,
        });
        return { handle: opened, delegate: candidate };
      } catch (error: unknown) {
        console.warn(`[vision] ObjectDetector 생성 실패 (delegate=${candidate})`, error);
      }
    }
    return null;
  }

  async function open(): Promise<OpenedDetector | null> {
    const first = await openOnce();
    if (first !== null || !wanted) {
      return first;
    }
    // 1회 재시도. 로딩 실패는 wasm/모델 fetch 타이밍처럼 일시적인 경우가 있고, 여기서 포기하면
    // 그 세션은 통째로 감지 없이 간다. 두 번을 넘겨 계속 재시도하지는 않는다 — 실패가 고정적일 때
    // 매 시도마다 GPU 초기화를 반복하면 발열과 지연만 는다.
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
    get modelVariant() {
      return modelVariant;
    },

    async load(): Promise<DetectorState> {
      wanted = true;
      if (state === "ready") {
        return state;
      }
      if (pending !== null) {
        // 이미 로딩 중이다 — 두 번째 detector를 만들지 않고 그 결과를 기다린다.
        await pending;
        return state;
      }

      state = "loading";
      pending = open();
      const opened = await pending;
      pending = null;

      if (opened === null) {
        // 여기서도 던지지 않는다. "감지 불가"는 상태로 표현하고 호출부가 보고 판단한다.
        if (wanted) {
          state = "unavailable";
        }
        return state;
      }
      if (!wanted) {
        // 모델을 받는 동안 세션을 나갔다(= close). 아무도 이 detector를 들고 있지 않으므로
        // 여기서 닫지 않으면 GPU 컨텍스트가 고아로 남는다.
        opened.handle.close();
        return state;
      }

      handle = opened.handle;
      delegate = opened.delegate;
      consecutiveFailures = 0;
      state = "ready";
      return state;
    },

    detect(video: HTMLVideoElement, timestampMs: number): DetectionResult | null {
      if (state !== "ready" || handle === null) {
        return null;
      }
      const startedAt = performance.now();
      let raw: MediapipeDetectionResult;
      try {
        raw = handle.detectForVideo(video, timestampMs);
      } catch (error: unknown) {
        consecutiveFailures += 1;
        console.warn(`[vision] detectForVideo 실패 (${consecutiveFailures}회 연속)`, error);
        if (consecutiveFailures >= MAX_CONSECUTIVE_DETECT_FAILURES) {
          releaseHandle();
          state = "unavailable";
        }
        return null;
      }
      consecutiveFailures = 0;
      return { detections: normalize(raw), durationMs: performance.now() - startedAt };
    },

    close(): void {
      wanted = false;
      releaseHandle();
      state = "idle";
    },
  };
}
