import { describe, expect, it } from "vitest";

import { DEFAULT_DETECTION_PARAMS } from "../../detection";
import {
  EYE_AWAKE_CLEAR_SAMPLES,
  EYE_CALIBRATION_SAMPLES,
  EYE_RATIO_WINDOW_SAMPLES,
  EYE_THRESHOLD_MIN,
  FACE_FRAME_DIVISOR,
  FACE_SMOOTHING_SAMPLES,
  FRAME_INTERVAL_MS,
  SLEEP_THRESHOLDS,
} from "../visionConfig";

describe("눈 보정과 비율", () => {
  it("보정 표본이 최소 평활 표본보다 많다", () => {
    expect(EYE_CALIBRATION_SAMPLES).toBeGreaterThan(FACE_SMOOTHING_SAMPLES);
  });

  it("하한이 고정 임계와 같다 — 보정은 임계를 올리기만 한다", () => {
    expect(EYE_THRESHOLD_MIN).toBe(SLEEP_THRESHOLDS.eyeClosure);
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
