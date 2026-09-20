import { describe, expect, it } from "vitest";

import type { EyeCalibration } from "../eyeCalibration";
import { calibrateEye } from "../eyeCalibration";
import {
  EYE_CALIBRATION_DELTA,
  EYE_CALIBRATION_SAMPLES,
  EYE_THRESHOLD_MIN,
  SLEEP_THRESHOLDS,
} from "../visionConfig";

function readings(value: number, count = EYE_CALIBRATION_SAMPLES): number[] {
  return Array.from({ length: count }, () => value);
}

/** 창 하나를 흘려 보정을 한 번 갱신한다. 어댑터가 하는 일과 같다. */
function window(previous: EyeCalibration | null, value: number): EyeCalibration | null {
  return calibrateEye(readings(value), previous);
}

describe("calibrateEye", () => {
  it("창이 다 차기 전에는 갱신하지 않는다", () => {
    expect(calibrateEye([], null)).toBeNull();
    expect(calibrateEye(readings(0.2, EYE_CALIBRATION_SAMPLES - 1), null)).toBeNull();
  });

  it("스파이크 피험자의 뜬 눈이면 고정 임계와 같은 값이 나온다 — 기존 동작을 재현한다", () => {
    expect(window(null, 0.2)?.threshold).toBeCloseTo(SLEEP_THRESHOLDS.eyeClosure, 2);
  });

  it("눈이 작아 뜬 눈 점수가 높은 사람은 임계가 올라간다", () => {
    expect(window(null, 0.35)?.threshold).toBeCloseTo(0.35 + EYE_CALIBRATION_DELTA, 2);
  });

  it("눈이 커 뜬 눈 점수가 낮아도 고정 임계 아래로는 내려가지 않는다", () => {
    // 하한이 고정 임계다. 보정은 임계를 올리기만 한다 — 내리는 쪽은 오탐 방향이다.
    expect(window(null, 0.05)?.threshold).toBe(EYE_THRESHOLD_MIN);
  });

  it("창 횟수와 기준값을 함께 돌려준다 — 덩어리와 패널이 읽는다", () => {
    expect(window(null, 0.2)).toEqual({ windows: 1, baseline: 0.2, threshold: 0.45 });
  });

  it("보정 중에 잠깐 감아도 기준이 올라가지 않는다 — 창 안에서도 낮은 쪽을 본다", () => {
    const mostlyOpen = [...readings(0.2, 12), 0.6, 0.6, 0.6];
    expect(calibrateEye(mostlyOpen, null)?.baseline).toBeCloseTo(0.2, 2);
  });

  it("뜬 눈이 열에 넷이면 그쪽을 기준으로 잡는다 — nearest-rank 경계다", () => {
    // 뜬 눈 여섯에 감김 아홉. 백분위 0.4가 정확히 이 경계를 가리킨다. 표준 nearest-rank는 뜬 눈을
    // 고르고, 인덱스를 하나 밀어 쓰는 정의는 감김을 골라 기준이 통째로 뒤집힌다.
    const boundary = [...readings(0.2, 6), ...readings(0.6, 9)];
    expect(calibrateEye(boundary, null)?.baseline).toBeCloseTo(0.2, 2);
  });

  it("창 안에서 몇 표본만 낮은 것으로는 기준이 안 내려간다 — 잡음 하나가 세션을 정하면 안 된다", () => {
    // 뜬 눈 0.55인 사람의 한 창에 낮은 값 셋이 섞인다. 백분위가 낮으면 이 셋이 기준이 된다.
    const noisy = [...readings(0.2, 3), ...readings(0.55, 12)];
    expect(calibrateEye(noisy, null)?.baseline).toBeCloseTo(0.55, 2);
  });

  it("뜬 눈 기준값이 높으면 임계가 그만큼 올라간다 — 상한이 없다", () => {
    // 뜬 눈이 0.5인 사람은 감으면 0.8~0.9까지 갈 수 있다. 상한으로 자르면 뜬 눈과 임계의 간격이
    // 얇아져 깨어 있는데 졸음으로 찍힌다. 높아서 틀리면 놓치는 쪽이라 그쪽을 택한다.
    expect(window(null, 0.5)?.threshold).toBeCloseTo(0.5 + EYE_CALIBRATION_DELTA, 2);
    expect(window(null, 0.9)?.threshold).toBeCloseTo(0.9 + EYE_CALIBRATION_DELTA, 2);
  });

  it("창마다 다시 재고 더 낮은 기준값이 나오면 내려간다 — 처음부터 자던 사람이 회복된다", () => {
    const asleep = window(null, 0.6);
    expect(asleep?.baseline).toBeCloseTo(0.6, 2);

    const awake = window(asleep, 0.2);
    expect(awake?.baseline).toBeCloseTo(0.2, 2);
    expect(awake?.threshold).toBeCloseTo(0.45, 2);
    expect(awake?.windows).toBe(2);
  });

  it("기준값은 내려가기만 한다 — 조는 동안의 높은 점수가 기준을 밀어 올리면 안 된다", () => {
    const first = window(null, 0.2);
    const second = window(first, 0.6);

    expect(second?.baseline).toBeCloseTo(0.2, 2);
    expect(second?.threshold).toBeCloseTo(0.45, 2);
    expect(second?.windows).toBe(2);
  });

  it("창을 돌 때마다 횟수가 는다", () => {
    const third = window(window(window(null, 0.3), 0.3), 0.3);

    expect(third?.windows).toBe(3);
  });

  it("표본이 창보다 많으면 앞의 것만 쓴다 — 나머지는 호출부가 다음 창으로 넘긴다", () => {
    const early = readings(0.2);
    const late = readings(0.6);
    expect(calibrateEye([...early, ...late], null)?.baseline).toBeCloseTo(0.2, 2);
  });
});

describe("눈 보정 상수", () => {
  it("하한이 고정 임계와 같다 — 보정이 임계를 느슨하게 만들 수 없다", () => {
    expect(EYE_THRESHOLD_MIN).toBe(SLEEP_THRESHOLDS.eyeClosure);
  });
});
