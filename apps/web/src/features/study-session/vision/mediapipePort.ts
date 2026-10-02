import type { Delegate } from "./visionConfig";

/**
 * MediaPipe 포트 — 우리가 필요한 만큼만 선언한다.
 * 구현은 메인 스레드용 `./mediapipeModule.ts`와 워커용 `./workerRuntime.ts`이고, 테스트는 fake가 채운다.
 *
 * 래퍼 파일이 아니라 여기에 두는 이유는 객체 검출과 얼굴 인식이 같은 wasm 런타임과 같은 워커를 쓰기
 * 때문이다. 한쪽 래퍼 파일에 두면 다른 래퍼가 MediaPipe 타입 때문에 그 파일을 import하게 된다.
 *
 * 런타임 인터페이스는 둘로 나눠 둔다. 객체 검출 래퍼는 얼굴 팩토리를 모르고, 얼굴 래퍼는
 * 객체 팩토리를 모른다. 실제 구현은 둘 다 제공하지만, 한쪽만 필요한 테스트가 다른 쪽까지
 * 흉내 내야 하는 일을 막는다.
 */

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

/** 검출기가 도는 곳. `vision_detector_ready`의 `runtime` 속성으로도 나간다. */
export type VisionRuntimeKind = "worker" | "main";

/**
 * 캐시 판정에 쓰는 Resource Timing 값
 *
 * 워커가 받은 자원은 문서의 Resource Timing에 잡히지 않아 워커가 이 모양으로 보내 준다.
 * `startTime`은 `performance.now()` 기준의 문서 시각이다.
 */
export type AssetTiming = Pick<
  PerformanceResourceTiming,
  "name" | "startTime" | "transferSize" | "encodedBodySize" | "decodedBodySize"
>;

/**
 * 추론 핸들의 공통 모양. 워커 경로는 프레임을 떠서 넘기고 결과를 기다린다.
 * 메인 스레드 경로는 동기 추론을 감쌀 뿐이다.
 */
export interface MediapipeInferenceHandle<Result> {
  readonly runtime: VisionRuntimeKind;
  detect(video: HTMLVideoElement, timestampMs: number): Promise<Result>;
  close(): void;
}

export interface MediapipeDetectorHandle extends MediapipeInferenceHandle<MediapipeDetectionResult> {
  /** 워커가 받은 wasm·모델의 Resource Timing. 메인 스레드 경로는 문서에 잡히므로 비어 있다. */
  readonly assetTimings: readonly AssetTiming[];
}

export interface DetectorCreateOptions {
  readonly wasmPath: string;
  readonly modelAssetPath: string;
  readonly delegate: Delegate;
  readonly categoryAllowlist: readonly string[];
  readonly scoreThreshold: number;
}

/**
 * 얼굴 랜드마크 하나. 정규화 좌표(0~1)다.
 *
 * 이 타입이 포트에 있는 것은 래퍼가 품질 게이트를 계산해야 하기 때문이고, 계산이 끝나면
 * 버린다. 래퍼 밖으로는 나가지 않는다 — `sleepRules.ts`의 `FaceObservation`에 자리가 없다.
 */
export interface MediapipeNormalizedLandmark {
  readonly x: number;
  readonly y: number;
}

/** 4×4 자세 행렬. `data`는 16개 평탄 배열이고 배치(행/열 우선)는 문서화돼 있지 않다 — `faceLandmarker.ts` 참고. */
export interface MediapipeMatrix {
  readonly rows: number;
  readonly columns: number;
  readonly data: readonly number[];
}

export interface MediapipeFaceResult {
  readonly faceLandmarks: readonly (readonly MediapipeNormalizedLandmark[])[];
  readonly faceBlendshapes: readonly { readonly categories: readonly MediapipeCategory[] }[];
  /** `outputFacialTransformationMatrixes`를 켰을 때만 온다. 옛 결과 픽스처와의 호환을 위해 선택이다. */
  readonly facialTransformationMatrixes?: readonly MediapipeMatrix[];
}

export type MediapipeFaceLandmarkerHandle = MediapipeInferenceHandle<MediapipeFaceResult>;

export interface FaceLandmarkerCreateOptions {
  readonly wasmPath: string;
  readonly modelAssetPath: string;
  readonly delegate: Delegate;
  readonly numFaces: number;
  readonly minFaceDetectionConfidence: number;
  readonly minFacePresenceConfidence: number;
  readonly minTrackingConfidence: number;
}

/**
 * MediaPipe를 감싼 최소 런타임. 클래스(`FilesetResolver`·`ObjectDetector`)를 그대로 노출하지
 * 않고 **"detector 하나 만들어 줘"** 로 좁힌 이유는, 이 인터페이스가 그대로 워커 메시지 계약이
 * 되기 때문이다(`./workerProtocol.ts`).
 */
export interface MediapipeObjectRuntime {
  createDetector(options: DetectorCreateOptions): Promise<MediapipeDetectorHandle>;
}

export interface MediapipeFaceRuntime {
  createFaceLandmarker(
    options: FaceLandmarkerCreateOptions,
  ): Promise<MediapipeFaceLandmarkerHandle>;
}

/** 실제 구현(`./mediapipeModule.ts`·`./workerRuntime.ts`)이 제공하는 전체 런타임. */
export type MediapipeVisionRuntime = MediapipeObjectRuntime & MediapipeFaceRuntime;
