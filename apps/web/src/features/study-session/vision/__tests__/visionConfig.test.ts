import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DEFAULT_DETECTION_PARAMS } from "../../detection";
import {
  EYE_AWAKE_CLEAR_SAMPLES,
  EYE_CALIBRATION_SAMPLES,
  EYE_RATIO_WINDOW_SAMPLES,
  FACE_FRAME_DIVISOR,
  FACE_MODEL_PATH,
  FACE_SMOOTHING_SAMPLES,
  FRAME_INTERVAL_MS,
  MODEL_PATHS,
} from "../visionConfig";

const modelsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../public/models",
);

describe("모델 파일명", () => {
  // `/models`는 1년 immutable 캐시로 나간다. 이름이 같으면 내용을 바꿔도 받은 기기는 옛 파일을 쓴다.
  it("public/models의 모든 파일명이 내용 sha256 앞 8자로 끝난다", () => {
    for (const file of readdirSync(modelsDir)) {
      const hash = createHash("sha256")
        .update(readFileSync(path.join(modelsDir, file)))
        .digest("hex");
      expect(path.parse(file).name.endsWith(`-${hash.slice(0, 8)}`), file).toBe(true);
    }
  });

  it("모델 경로 상수가 실제 파일을 가리킨다", () => {
    const files = readdirSync(modelsDir).map((file) => `/models/${file}`);
    expect(files).toEqual(expect.arrayContaining([...Object.values(MODEL_PATHS), FACE_MODEL_PATH]));
  });
});

describe("눈 보정과 비율", () => {
  it("보정 표본이 최소 평활 표본보다 많다", () => {
    expect(EYE_CALIBRATION_SAMPLES).toBeGreaterThan(FACE_SMOOTHING_SAMPLES);
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
