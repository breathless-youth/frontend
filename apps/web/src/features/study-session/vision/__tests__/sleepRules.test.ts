import { describe, expect, it } from "vitest";

import type { FaceObservation, SleepFrame } from "../sleepRules";
import { evaluateSleep, smoothedEyeClosure, smoothedFacePresent } from "../sleepRules";
import {
  EYE_RATIO_THRESHOLD,
  EYE_RATIO_WINDOW_SAMPLES,
  FACE_SMOOTHING_SAMPLES,
  SLEEP_THRESHOLDS,
} from "../visionConfig";

/** 눈이 보이는 관측 하나. 양쪽 눈에 같은 값을 넣는다. */
function seen(closure: number): FaceObservation {
  return {
    facePresent: true,
    eye: {
      eyeBlinkLeft: closure,
      eyeBlinkRight: closure,
      eyeLookDownLeft: 0.1,
      eyeLookDownRight: 0.1,
    },
    eyeSkipReason: null,
  };
}

/** 얼굴은 있는데 눈 판정이 없는 관측(너무 작거나 점수 이름이 없을 때). */
const gated: FaceObservation = { facePresent: true, eye: null, eyeSkipReason: "face-too-small" };
const absent: FaceObservation = { facePresent: false, eye: null, eyeSkipReason: "no-face" };

function frame(overrides: Partial<SleepFrame> = {}): SleepFrame {
  return {
    personPresent: true,
    personScore: 0.9,
    faceSamples: [],
    faceStable: true,
    headInFrame: null,
    eyeClosureThreshold: SLEEP_THRESHOLDS.eyeClosure,
    eyeReadings: [],
    ...overrides,
  };
}

describe("smoothedEyeClosure", () => {
  it("표본이 둘 미만이면 판정하지 않는다 — 깜빡임 하나로 진입하면 안 된다", () => {
    expect(smoothedEyeClosure([])).toBeNull();
    expect(smoothedEyeClosure([seen(0.9)])).toBeNull();
  });

  it("둘이면 작은 쪽을 쓴다", () => {
    expect(smoothedEyeClosure([seen(0.9), seen(0.2)])).toBeCloseTo(0.2);
  });

  it("셋을 넘기면 최근 둘만 본다 — 창이 둘이라 오래된 표본은 잊는다", () => {
    expect(smoothedEyeClosure([seen(0.1), seen(0.9), seen(0.2)])).toBeCloseTo(0.2);
  });

  it("눈 판정이 없는 관측은 세지 않는다 — 창 안에 눈 판정이 둘 미만이면 판정도 없다", () => {
    expect(smoothedEyeClosure([gated, seen(0.8), seen(0.7)])).toBeCloseTo(0.7);
    expect(smoothedEyeClosure([seen(0.8), gated])).toBeNull();
    expect(smoothedEyeClosure([seen(0.8), gated, absent])).toBeNull();
  });

  it("양쪽 눈 중 작은 쪽으로 읽는다 — 한쪽만 감은 것은 감은 것이 아니다", () => {
    const oneEye: FaceObservation = {
      facePresent: true,
      eye: {
        eyeBlinkLeft: 0.9,
        eyeBlinkRight: 0.1,
        eyeLookDownLeft: 0.1,
        eyeLookDownRight: 0.1,
      },
      eyeSkipReason: null,
    };
    expect(smoothedEyeClosure([oneEye, oneEye])).toBeCloseTo(0.1);
  });
});

describe("smoothedFacePresent", () => {
  it("표본이 둘 미만이면 판정하지 않는다 — 눈 쪽과 같은 기준이다", () => {
    expect(smoothedFacePresent([])).toBeNull();
    expect(smoothedFacePresent([absent])).toBeNull();
  });

  it("최근 둘이 모두 보여야 있다고 본다", () => {
    expect(smoothedFacePresent([seen(0.1), seen(0.1)])).toBe(true);
    expect(smoothedFacePresent([absent, seen(0.1), seen(0.1)])).toBe(true);
    expect(smoothedFacePresent([absent, seen(0.1), absent])).toBe(false);
  });

  it("동수면 없다고 본다 — 얼굴 소실은 긴 유지시간이 다시 거른다", () => {
    expect(smoothedFacePresent([seen(0.1), absent])).toBe(false);
    expect(smoothedFacePresent([absent, seen(0.1)])).toBe(false);
  });
});

describe("evaluateSleep — 눈 감김", () => {
  it("최근 두 표본이 모두 임계 이상이면 참이다", () => {
    const closed = SLEEP_THRESHOLDS.eyeClosure;
    expect(evaluateSleep(frame({ faceSamples: [seen(closed), seen(closed)] })).eyesClosed).toBe(
      true,
    );
  });

  it("임계 바로 아래면 거짓이다", () => {
    const open = SLEEP_THRESHOLDS.eyeClosure - 0.01;
    expect(evaluateSleep(frame({ faceSamples: [seen(open), seen(open)] })).eyesClosed).toBe(false);
  });

  it("깜빡임 한 표본으로는 진입하지 않는다 — 감김 둘이 이어져야 한다", () => {
    const blink = seen(0.9);
    const open = seen(0.2);
    expect(evaluateSleep(frame({ faceSamples: [open, blink] })).eyesClosed).toBe(false);
    expect(evaluateSleep(frame({ faceSamples: [open, blink, open] })).eyesClosed).toBe(false);
  });

  it("뜬 표본 하나면 어느 순서든 뜬 것이다 — 해제가 중앙값을 기다리지 않는다", () => {
    const closed = seen(0.9);
    const open = seen(0.2);
    expect(evaluateSleep(frame({ faceSamples: [closed, closed, open] })).eyesClosed).toBe(false);
    expect(evaluateSleep(frame({ faceSamples: [closed, open, closed] })).eyesClosed).toBe(false);
  });

  it("표본이 하나뿐이면 판정하지 않는다", () => {
    expect(evaluateSleep(frame({ faceSamples: [seen(0.9)] })).eyesClosed).toBe(false);
    expect(smoothedEyeClosure([seen(0.9)])).toBeNull();
  });

  it("사람이 없으면 눈이 감겨 있어도 거짓이다 — 자리 이탈이 먼저다", () => {
    const closed = seen(0.9);
    const signals = evaluateSleep(
      frame({ personPresent: false, faceSamples: [closed, closed, closed] }),
    );
    expect(signals.eyesClosed).toBe(false);
  });

  it("눈 판정이 없으면 거짓이다 — 판정 없음이지 눈 뜸이 아니다", () => {
    expect(evaluateSleep(frame({ faceSamples: [gated, gated, gated] })).eyesClosed).toBe(false);
  });
});

describe("evaluateSleep — 엎드림", () => {
  const lost = [absent, absent, absent];

  it("사람이 있고 얼굴이 사라졌고 기준선을 채웠으면 참이다", () => {
    expect(evaluateSleep(frame({ faceSamples: lost })).faceLost).toBe(true);
  });

  it("기준선을 못 채웠으면 거짓이다 — 몸만 찍는 배치를 막는다", () => {
    expect(evaluateSleep(frame({ faceSamples: lost, faceStable: false })).faceLost).toBe(false);
  });

  it("사람 점수가 낮으면 거짓이다 — 어두워서 안 보이는 것과 구분한다", () => {
    const dim = SLEEP_THRESHOLDS.faceLostPersonScore - 0.01;
    expect(evaluateSleep(frame({ faceSamples: lost, personScore: dim })).faceLost).toBe(false);
  });

  it("머리가 화면 밖이라고 판정되면 거짓이다", () => {
    expect(evaluateSleep(frame({ faceSamples: lost, headInFrame: false })).faceLost).toBe(false);
  });

  it("머리 판정이 없으면 막지 않는다 — 아비터는 후속이다", () => {
    expect(evaluateSleep(frame({ faceSamples: lost, headInFrame: null })).faceLost).toBe(true);
  });

  it("얼굴이 다시 잡히면 거짓이다", () => {
    expect(evaluateSleep(frame({ faceSamples: [absent, seen(0.2), seen(0.2)] })).faceLost).toBe(
      false,
    );
  });

  it("사람이 없으면 거짓이다 — 자리 이탈이 가져간다", () => {
    expect(evaluateSleep(frame({ personPresent: false, faceSamples: lost })).faceLost).toBe(false);
  });

  it("표본이 없으면 거짓이다 — 얼굴 추론이 아직 안 돌았다", () => {
    expect(evaluateSleep(frame({ faceSamples: [] })).faceLost).toBe(false);
  });
});

describe("evaluateSleep — 보정된 임계", () => {
  it("임계를 받아 쓴다 — 고정값이 아니다", () => {
    const samples = [seen(0.5), seen(0.5)];
    expect(
      evaluateSleep(frame({ faceSamples: samples, eyeClosureThreshold: 0.6 })).eyesClosed,
    ).toBe(false);
    expect(
      evaluateSleep(frame({ faceSamples: samples, eyeClosureThreshold: 0.4 })).eyesClosed,
    ).toBe(true);
  });
});

describe("evaluateSleep — 비율", () => {
  const closed = 0.6;
  const open = 0.2;
  function window(closedCount: number): number[] {
    return [
      ...Array.from({ length: closedCount }, () => closed),
      ...Array.from({ length: EYE_RATIO_WINDOW_SAMPLES - closedCount }, () => open),
    ];
  }

  it("창은 표본 22개, 얼굴 틱 2초로 44초다", () => {
    expect(EYE_RATIO_WINDOW_SAMPLES).toBe(22);
  });

  it("창이 다 차기 전에는 판정하지 않는다", () => {
    const partial = Array.from({ length: EYE_RATIO_WINDOW_SAMPLES - 1 }, () => closed);
    expect(evaluateSleep(frame({ eyeReadings: partial })).eyesDrowsy).toBe(false);
  });

  it("비율이 임계 이상이면 참이다 — 꾸벅거림은 이걸로만 잡힌다", () => {
    const needed = Math.ceil(EYE_RATIO_WINDOW_SAMPLES * EYE_RATIO_THRESHOLD);
    expect(evaluateSleep(frame({ eyeReadings: window(needed) })).eyesDrowsy).toBe(true);
  });

  it("비율이 임계 바로 아래면 거짓이다", () => {
    const needed = Math.ceil(EYE_RATIO_WINDOW_SAMPLES * EYE_RATIO_THRESHOLD);
    expect(evaluateSleep(frame({ eyeReadings: window(needed - 1) })).eyesDrowsy).toBe(false);
  });

  it("3초 감고 1초 뜨는 패턴을 잡는다 — 연속 규칙은 못 잡는다", () => {
    const pattern: number[] = [];
    while (pattern.length < EYE_RATIO_WINDOW_SAMPLES) {
      pattern.push(closed, closed, closed, open);
    }
    const readings = pattern.slice(0, EYE_RATIO_WINDOW_SAMPLES);
    expect(evaluateSleep(frame({ eyeReadings: readings })).eyesDrowsy).toBe(true);
  });

  it("사람이 없으면 거짓이다", () => {
    const all = window(EYE_RATIO_WINDOW_SAMPLES);
    expect(evaluateSleep(frame({ personPresent: false, eyeReadings: all })).eyesDrowsy).toBe(false);
  });

  it("창보다 긴 배열은 최근 것만 본다", () => {
    const old = Array.from({ length: 30 }, () => closed);
    const recent = window(0);
    expect(evaluateSleep(frame({ eyeReadings: [...old, ...recent] })).eyesDrowsy).toBe(false);
  });
});

describe("evaluateSleep — 규칙 교체", () => {
  it("규칙을 갈아끼울 수 있다", () => {
    const always = { evaluate: () => ({ eyesClosed: true, eyesDrowsy: true, faceLost: true }) };
    expect(evaluateSleep(frame(), always)).toEqual({
      eyesClosed: true,
      eyesDrowsy: true,
      faceLost: true,
    });
  });
});

describe("평활 창", () => {
  it("창은 둘이고 짝수 창은 아래쪽 중앙값이라 둘 다 감겨야 감김이다", () => {
    expect(FACE_SMOOTHING_SAMPLES).toBe(2);
    expect(smoothedEyeClosure([seen(0.9), seen(0.1)])).toBeCloseTo(0.1);
    expect(smoothedEyeClosure([seen(0.1), seen(0.9)])).toBeCloseTo(0.1);
    expect(smoothedEyeClosure([seen(0.9), seen(0.9)])).toBeCloseTo(0.9);
  });

  it("창보다 긴 배열을 넘기면 최근 것만 본다 — 자르기는 규칙이 한다", () => {
    const old = Array.from({ length: 10 }, () => seen(0.95));
    const recent = [seen(0.1), seen(0.1), seen(0.1)];
    expect(smoothedEyeClosure([...old, ...recent])).toBeCloseTo(0.1);
    expect(smoothedFacePresent([...Array.from({ length: 10 }, () => absent), ...recent])).toBe(
      true,
    );
  });
});
