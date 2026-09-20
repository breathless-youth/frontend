import type { EyeBlendshapeName, RequiredEyeBlendshapeName } from "./visionConfig";
import { FACE_SMOOTHING_SAMPLES, SLEEP_THRESHOLDS } from "./visionConfig";

/**
 * 졸음 판정 — 순수 함수만 있다.
 *
 * 얼굴 모델은 "눈꺼풀이 이만큼 덮였다"까지만 알려준다. "졸고 있다"는 판정은 여기서 만들고,
 * 그 뒤의 유지시간 판정은 `../detection.ts`가 한다. 이 모듈에서 유지시간을 다시 구현하지 말 것.
 *
 * MediaPipe에 의존하지 않는다 — `faceLandmarker.ts`가 정규화한 값만 받는다.
 */

/**
 * 눈 점수. 판정에 쓰는 둘은 반드시 있고, 나머지는 모델이 주면 싣는다.
 *
 * 진단에만 쓰는 점수까지 필수로 요구하면 그 이름이 바뀌었을 때 판정이 통째로 죽는다.
 */
export type EyeScores = Readonly<Record<RequiredEyeBlendshapeName, number>> &
  Readonly<Partial<Record<EyeBlendshapeName, number>>>;

/**
 * 얼굴 관측 하나. **좌표가 없다.**
 *
 * 랜드마크 478점은 래퍼 밖으로 나가지 않는다. 눈 간격 같은 파생 수치도 마찬가지다 — 크기와
 * 거리는 검출 박스 좌표와 같은 성격의 위치 정보라, 품질 게이트를 통과했는지만 `eye`의 유무로
 * 남긴다.
 */
export interface FaceObservation {
  /** 모델이 얼굴을 찾았는가. 품질과 무관하다 — 엎드림 규칙이 이 값을 본다. */
  readonly facePresent: boolean;
  /** 눈 관련 점수. 품질 게이트를 통과했을 때만 있다. null은 이번 관측에 눈 판정이 없다는 뜻이다. */
  readonly eye: EyeScores | null;
  /** `eye`가 null인 이유. 진단 로그용이고 판정에는 쓰지 않는다. */
  readonly eyeSkipReason: "no-face" | "face-too-small" | "blendshapes-missing" | null;
}

/**
 * 한 번의 판정에 쓰는 입력.
 *
 * `faceSamples`는 최근 관측을 오래된 것부터 담은 배열이다. 상태를 규칙이 아니라 호출부가 들고
 * 있어야 규칙이 픽스처만으로 검증된다. 창 크기로 자르는 것은 규칙이 하므로 더 긴 배열을 넘겨도 된다.
 */
export interface SleepFrame {
  readonly personPresent: boolean;
  readonly personScore: number;
  readonly faceSamples: readonly FaceObservation[];
  /** 얼굴이 최근 충분히 오래 안정적으로 보였는가. 몸만 찍는 배치를 막는 기준선이다. */
  readonly faceStable: boolean;
  /** 머리가 화면 안에 있는가. 판별기가 없으면 null이고, null은 막지 않는다는 뜻이다. */
  readonly headInFrame: boolean | null;
}

export interface SleepSignals {
  readonly eyesClosed: boolean;
  readonly faceLost: boolean;
}

export const NO_SLEEP_SIGNALS: SleepSignals = { eyesClosed: false, faceLost: false };

/** 판정 규칙 교체 지점. 임계가 아니라 판정 방식 자체를 바꿀 때 쓴다. */
export interface SleepRule {
  evaluate(frame: SleepFrame): SleepSignals;
}

/**
 * 평활에 필요한 최소 관측 수. 하나로 판정하면 깜빡임 한 번이나 오검출 한 번이 그대로 결론이 된다.
 * 두 평활 함수가 같은 값을 쓴다 — 한쪽만 느슨하면 호출부가 둘을 다르게 믿는다.
 */
const MIN_SMOOTHING_READINGS = 2;

/**
 * 창 크기만큼의 최근 관측. 자르기를 여기서 하므로 호출부가 더 긴 배열을 넘겨도 안전하고,
 * "창은 홀수"라는 전제가 주석이 아니라 코드에 묶인다.
 */
function recentWindow(samples: readonly FaceObservation[]): readonly FaceObservation[] {
  return samples.length <= FACE_SMOOTHING_SAMPLES
    ? samples
    : samples.slice(samples.length - FACE_SMOOTHING_SAMPLES);
}

/**
 * 최근 관측의 눈 감김 대표값. 눈 판정이 있는 관측이 둘 미만이면 `null`이다.
 *
 * 관측마다 **양쪽 눈 중 작은 쪽**을 읽는다. 한쪽만 감은 것은 감은 것이 아니기 때문이다.
 * 짝수 개일 때 아래쪽 중앙값을 쓰는 것은 진입을 어렵게 하는 방향이다.
 */
export function smoothedEyeClosure(samples: readonly FaceObservation[]): number | null {
  const readings: number[] = [];
  for (const sample of recentWindow(samples)) {
    if (sample.eye !== null) {
      readings.push(Math.min(sample.eye.eyeBlinkLeft, sample.eye.eyeBlinkRight));
    }
  }
  if (readings.length < MIN_SMOOTHING_READINGS) {
    return null;
  }
  readings.sort((a, b) => a - b);
  return readings[Math.floor((readings.length - 1) / 2)] ?? null;
}

/**
 * 최근 관측의 얼굴 유무 대표값. 표본이 둘 미만이면 `null`이다.
 *
 * 동수면 없다고 본다. 얼굴 소실은 유지시간이 길어서 한 번 잘못 기울어도 곧 뒤집히지만,
 * 있다고 보면 이미 쌓인 엎드림 유지시간이 초기화된다.
 */
export function smoothedFacePresent(samples: readonly FaceObservation[]): boolean | null {
  const window = recentWindow(samples);
  if (window.length < MIN_SMOOTHING_READINGS) {
    return null;
  }
  const present = window.filter((sample) => sample.facePresent).length;
  return present * 2 > window.length;
}

/** 2026-09-20 실측으로 정한 판정. 임계 근거는 `visionConfig.ts`의 `SLEEP_THRESHOLDS` 주석에 있다. */
export const defaultSleepRule: SleepRule = {
  evaluate(frame) {
    if (!frame.personPresent) {
      // 자리에 사람이 없으면 자리 이탈이 가져간다. 얼굴 신호는 관측 자체가 불확실하다.
      return NO_SLEEP_SIGNALS;
    }
    const closure = smoothedEyeClosure(frame.faceSamples);
    const facePresent = smoothedFacePresent(frame.faceSamples);
    return {
      eyesClosed: closure !== null && closure >= SLEEP_THRESHOLDS.eyeClosure,
      faceLost:
        facePresent === false &&
        frame.faceStable &&
        frame.headInFrame !== false &&
        frame.personScore >= SLEEP_THRESHOLDS.faceLostPersonScore,
    };
  },
};

export function evaluateSleep(frame: SleepFrame, rule: SleepRule = defaultSleepRule): SleepSignals {
  return rule.evaluate(frame);
}
