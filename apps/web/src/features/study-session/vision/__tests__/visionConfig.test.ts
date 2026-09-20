import { describe, expect, it } from "vitest";

import { DEFAULT_DETECTION_PARAMS } from "../../detection";
import {
  EYE_AWAKE_CLEAR_SAMPLES,
  EYE_CALIBRATION_SAMPLES,
  EYE_RATIO_WINDOW_SAMPLES,
  EYE_THRESHOLD_MAX,
  EYE_THRESHOLD_MIN,
  FACE_BASELINE_MIN_RATIO,
  FACE_BASELINE_SAMPLES,
  FACE_BASELINE_WINDOW_MS,
  FACE_FRAME_DIVISOR,
  FACE_SMOOTHING_SAMPLES,
  FRAME_INTERVAL_MS,
  SLEEP_THRESHOLDS,
} from "../visionConfig";

describe("얼굴 기준선", () => {
  it("창은 얼굴 틱 간격으로 정확히 나뉜다 — 나머지가 남으면 버퍼 크기가 창과 어긋난다", () => {
    const faceTickMs = FACE_FRAME_DIVISOR * FRAME_INTERVAL_MS;
    expect(FACE_BASELINE_WINDOW_MS % faceTickMs).toBe(0);
    expect(FACE_BASELINE_SAMPLES).toBe(FACE_BASELINE_WINDOW_MS / faceTickMs);
  });

  it("기준선 창이 엎드림 유지시간보다 충분히 길다 — 짧으면 기준선이 걸러내지 못한다", () => {
    expect(FACE_BASELINE_WINDOW_MS).toBeGreaterThanOrEqual(
      DEFAULT_DETECTION_PARAMS.SLEEP_FACE.enterMs * 4,
    );
  });

  it("비율은 0과 1 사이다", () => {
    expect(FACE_BASELINE_MIN_RATIO).toBeGreaterThan(0.5);
    expect(FACE_BASELINE_MIN_RATIO).toBeLessThanOrEqual(1);
  });
});

describe("눈 보정과 비율", () => {
  it("보정 표본이 최소 평활 표본보다 많다", () => {
    expect(EYE_CALIBRATION_SAMPLES).toBeGreaterThan(FACE_SMOOTHING_SAMPLES);
  });

  it("상하한 사이에 고정 임계가 있다 — 보정이 없을 때 쓰는 값이 갇히는 범위 안이어야 한다", () => {
    expect(SLEEP_THRESHOLDS.eyeClosure).toBeGreaterThanOrEqual(EYE_THRESHOLD_MIN);
    expect(SLEEP_THRESHOLDS.eyeClosure).toBeLessThanOrEqual(EYE_THRESHOLD_MAX);
  });

  it("비율 창이 연속 판정 유지시간보다 길다 — 짧으면 둘이 같은 것을 잰다", () => {
    expect(EYE_RATIO_WINDOW_SAMPLES * FACE_FRAME_DIVISOR * FRAME_INTERVAL_MS).toBeGreaterThan(
      DEFAULT_DETECTION_PARAMS.SLEEP_EYES.enterMs,
    );
  });

  it("비율 창은 44초다 — 1분에서 줄여 꾸벅거림 진입을 앞당긴다", () => {
    expect(EYE_RATIO_WINDOW_SAMPLES * FACE_FRAME_DIVISOR * FRAME_INTERVAL_MS).toBe(44_000);
  });

  it("깨어남 표본 수는 평활 창보다 크고 비율 창보다 작다", () => {
    expect(EYE_AWAKE_CLEAR_SAMPLES).toBeGreaterThanOrEqual(2);
    expect(EYE_AWAKE_CLEAR_SAMPLES).toBeGreaterThan(FACE_SMOOTHING_SAMPLES);
    expect(EYE_AWAKE_CLEAR_SAMPLES).toBeLessThan(EYE_RATIO_WINDOW_SAMPLES);
  });
});
