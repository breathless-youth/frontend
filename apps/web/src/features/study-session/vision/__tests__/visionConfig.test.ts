import { describe, expect, it } from "vitest";

import { DEFAULT_DETECTION_PARAMS } from "../../detection";
import {
  FACE_BASELINE_MIN_RATIO,
  FACE_BASELINE_SAMPLES,
  FACE_BASELINE_WINDOW_MS,
  FACE_FRAME_DIVISOR,
  FRAME_INTERVAL_MS,
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
