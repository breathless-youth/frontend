import { vi } from "vitest";

import type {
  PhotoTap,
  VisionFocusDetector,
} from "@/features/study-session/adapters/focusDetector";

/**
 * 모델을 띄우지 않는 비전 감지기
 *
 * 세션 엔진을 쓰는 테스트가 vi.mock 안에서 동적 import로 받아 쓴다.
 */
export const visionStub: VisionFocusDetector = {
  status: "ready",
  runtime: "main",
  assetTimings: [],
  faceStatus: "ready",
  eyeCalibration: null,
  subscribe: () => () => {},
  subscribeStatus: () => () => {},
  subscribeRuntimeFallback: () => () => {},
  subscribeFaceStatus: () => () => {},
  subscribeFaceSpot: () => () => {},
  setPreviewOnly: () => {},
  preload: () => {},
  start: () => {},
  stop: () => {},
  close: () => {},
};

/** 기기 보관소에 사진을 남기지 않는 타임랩스 기록기 */
export const recorderStub = {
  photoTap: { due: () => null, save: () => {}, fail: () => {} } satisfies PhotoTap,
  begin: vi.fn<(startedAtMs: number) => void>(),
  finish: vi.fn(),
  idle: async () => {},
};
