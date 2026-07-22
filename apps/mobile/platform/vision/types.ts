/**
 * 온디바이스 Vision AI 어댑터 경계. UI/세션 로직은 이 인터페이스만 알고,
 * 실제 추론 라이브러리(프레임 프로세서/모델)는 알면 안 된다.
 * 원본 프레임·얼굴 이미지·랜드마크 좌표는 이 경계 밖으로 나가지 않는다(개인정보 원칙).
 */
export interface VisionObservation {
  timestampMs: number;
  /** Vision이 판정하는 순간 상태. PAUSED/CAMERA_OFF는 사용자/앱이 결정하므로 여기 없음. */
  status: "STUDYING" | "AWAY";
  confidence?: number;
}

export interface VisionEngine {
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
  subscribe(listener: (observation: VisionObservation) => void): () => void;
}
