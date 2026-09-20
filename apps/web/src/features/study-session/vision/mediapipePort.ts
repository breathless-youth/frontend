import type { Delegate } from "./visionConfig";

/**
 * MediaPipe 포트 — 우리가 필요한 만큼만 선언한다.
 * 구현은 `./mediapipeModule.ts`, 테스트는 fake가 채운다.
 *
 * 래퍼 파일이 아니라 여기에 두는 이유는 객체 검출과 얼굴 인식이 같은 wasm 런타임을 쓰기
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
 * 얼굴 랜드마크 하나. 정규화 좌표(0~1)다.
 *
 * 이 타입이 포트에 있는 것은 래퍼가 품질 게이트를 계산해야 하기 때문이고, 계산이 끝나면
 * 버린다. 래퍼 밖으로는 나가지 않는다 — `sleepRules.ts`의 `FaceObservation`에 자리가 없다.
 */
export interface MediapipeNormalizedLandmark {
  readonly x: number;
  readonly y: number;
}

export interface MediapipeFaceResult {
  readonly faceLandmarks: readonly (readonly MediapipeNormalizedLandmark[])[];
  readonly faceBlendshapes: readonly { readonly categories: readonly MediapipeCategory[] }[];
}

export interface MediapipeFaceLandmarkerHandle {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): MediapipeFaceResult;
  close(): void;
}

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
 * 않고 **"detector 하나 만들어 줘"** 로 좁힌 이유는, 워커 뒤로 옮길 때 이 인터페이스가
 * 그대로 메시지 계약이 되기 때문이다.
 */
export interface MediapipeObjectRuntime {
  createDetector(options: DetectorCreateOptions): Promise<MediapipeDetectorHandle>;
}

export interface MediapipeFaceRuntime {
  createFaceLandmarker(
    options: FaceLandmarkerCreateOptions,
  ): Promise<MediapipeFaceLandmarkerHandle>;
}

/** 실제 구현(`./mediapipeModule.ts`)이 제공하는 전체 런타임. */
export type MediapipeVisionRuntime = MediapipeObjectRuntime & MediapipeFaceRuntime;
