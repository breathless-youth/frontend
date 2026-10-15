import { describe, expect, it, vi } from "vitest";

import type { PhotoInput } from "@/features/timelapse/photoFrame";

import { createMediapipeRuntime } from "../mediapipeModule";

/**
 * 메인 스레드 예비 경로의 타임랩스 사진
 *
 * MediaPipe 모델은 가짜로 바꾸고 사진을 만드는 함수만 주입해 본다.
 * 같은 파일의 다른 테스트가 진짜 `FilesetResolver`를 쓰므로 파일을 나눴다.
 */

const LANDMARKS = [
  { x: 0.4, y: 0.3 },
  { x: 0.6, y: 0.6 },
];
const FACE = { faceLandmarks: [LANDMARKS], faceBlendshapes: [] };

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
  ObjectDetector: {
    createFromOptions: vi.fn(async () => ({
      detectForVideo: vi.fn(() => ({ detections: [] })),
      close: vi.fn(),
    })),
  },
  FaceLandmarker: {
    createFromOptions: vi.fn(async () => ({
      detectForVideo: vi.fn(() => FACE),
      close: vi.fn(),
    })),
  },
}));

const PHOTO = new Uint8Array([0xff, 0xd8]).buffer;
const video = { videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement;
const OBJECT_OPTIONS = {
  wasmPath: "/mediapipe/wasm",
  modelAssetPath: "/models/a.tflite",
  delegate: "CPU" as const,
  categoryAllowlist: ["person"],
  scoreThreshold: 0.3,
};
const FACE_OPTIONS = {
  wasmPath: "/mediapipe/wasm",
  modelAssetPath: "/models/face.task",
  delegate: "CPU" as const,
  numFaces: 1,
  minFaceDetectionConfidence: 0.5,
  minFacePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

describe("createMediapipeRuntime 타임랩스 사진", () => {
  it("얼굴 추론에 사진을 요청하면 `<video>`와 그 랜드마크로 만든 사진을 붙인다", async () => {
    const renderPhoto = vi.fn(async (_input: PhotoInput) => PHOTO);
    const handle = await createMediapipeRuntime(renderPhoto).createFaceLandmarker(FACE_OPTIONS);
    const spec = { aspect: "9:16" as const, mask: true };

    await expect(handle.detect(video, 0, spec)).resolves.toEqual({ ...FACE, photo: PHOTO });
    expect(renderPhoto).toHaveBeenCalledWith({
      source: video,
      frame: { width: 1280, height: 720 },
      spec,
      landmarks: LANDMARKS,
    });
  });

  it("사진을 요청하지 않으면 사진을 만들지 않는다", async () => {
    const renderPhoto = vi.fn(async (_input: PhotoInput) => PHOTO);
    const handle = await createMediapipeRuntime(renderPhoto).createFaceLandmarker(FACE_OPTIONS);

    await expect(handle.detect(video, 0)).resolves.toEqual(FACE);
    expect(renderPhoto).not.toHaveBeenCalled();
  });

  it("사진을 만들지 못해도 추론 결과는 돌려준다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const handle = await createMediapipeRuntime(async () => {
      throw new Error("toBlob 실패");
    }).createFaceLandmarker(FACE_OPTIONS);

    await expect(handle.detect(video, 0, { aspect: "9:16", mask: true })).resolves.toEqual(FACE);
  });

  it("객체 검출기 핸들의 capture는 랜드마크 없이 `<video>`로 사진을 만든다", async () => {
    const renderPhoto = vi.fn(async (_input: PhotoInput) => PHOTO);
    const handle = await createMediapipeRuntime(renderPhoto).createDetector(OBJECT_OPTIONS);
    const spec = { aspect: "16:9" as const, mask: false };

    await expect(handle.capture(video, spec)).resolves.toBe(PHOTO);
    expect(renderPhoto).toHaveBeenCalledWith({
      source: video,
      frame: { width: 1280, height: 720 },
      spec,
    });
  });
});
