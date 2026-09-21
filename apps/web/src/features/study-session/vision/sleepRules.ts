import type { EyeBlendshapeName, RequiredEyeBlendshapeName } from "./visionConfig";
import {
  EYE_RATIO_THRESHOLD,
  EYE_RATIO_WINDOW_SAMPLES,
  FACE_SMOOTHING_SAMPLES,
} from "./visionConfig";

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
  /** 모델이 얼굴을 찾았는가. 품질과 무관하다. 판정에는 안 쓰고 진단과 측정 패널이 본다. */
  readonly facePresent: boolean;
  /** 눈 관련 점수. 품질 게이트를 통과했을 때만 있다. null은 이번 관측에 눈 판정이 없다는 뜻이다. */
  readonly eye: EyeScores | null;
  /** `eye`가 null인 이유. 진단 로그용이고 판정에는 쓰지 않는다. */
  readonly eyeSkipReason:
    "no-face" | "face-too-small" | "looking-down" | "blendshapes-missing" | null;
}

/**
 * 한 번의 판정에 쓰는 입력.
 *
 * `faceSamples`는 최근 관측을 오래된 것부터 담은 배열이다. 상태를 규칙이 아니라 호출부가 들고
 * 있어야 규칙이 픽스처만으로 검증된다. 창 크기로 자르는 것은 규칙이 하므로 더 긴 배열을 넘겨도 된다.
 */
export interface SleepFrame {
  readonly personPresent: boolean;
  readonly faceSamples: readonly FaceObservation[];
  /**
   * 이 사람에게 맞춘 눈 감김 임계. 보정이 끝나기 전에는 null이고, null이면 눈 판정을 쉰다.
   *
   * 아직 그 사람의 뜬 눈이 몇 점인지 모르는 동안 고정값으로 판정하면, 뜬 눈이 원래 높은 사람이
   * 세션 시작 10초 만에 졸음으로 찍힌다. 그 30초 안에 잠드는 사람을 놓치는 쪽이 낫다.
   */
  readonly eyeClosureThreshold: number | null;
  /** 최근 얼굴 틱의 눈 감김 점수. 오래된 것부터. 비율 판정이 창 크기로 자른다. */
  readonly eyeReadings: readonly number[];
}

export interface SleepSignals {
  readonly eyesClosed: boolean;
  /** 최근 1분 중 감겨 있던 비율이 기준을 넘었는가. 연속 감김과 별개의 원신호다. */
  readonly eyesDrowsy: boolean;
}

export const NO_SLEEP_SIGNALS: SleepSignals = {
  eyesClosed: false,
  eyesDrowsy: false,
};

/** 판정 규칙 교체 지점. 임계가 아니라 판정 방식 자체를 바꿀 때 쓴다. */
export interface SleepRule {
  evaluate(frame: SleepFrame): SleepSignals;
}

/**
 * 평활에 필요한 최소 관측 수. 하나로 판정하면 깜빡임 한 번이나 오검출 한 번이 그대로 결론이 된다.
 */
const MIN_SMOOTHING_READINGS = 2;

/**
 * 창 크기만큼의 최근 관측. 자르기를 여기서 하므로 호출부가 더 긴 배열을 넘겨도 안전하다.
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
 * 짝수 개일 때 아래쪽 중앙값을 쓰므로 창이 둘인 지금은 둘 중 작은 값이다. 최근 두 표본이
 * 모두 감겨야 감김이고, 뜬 표본 하나가 들어오면 바로 뜬 것으로 읽힌다. 진입을 어렵게 하고
 * 해제를 빠르게 하는 방향이다.
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
 * 창 안에서 눈이 감겨 있던 비율. 창이 아직 다 안 찼으면 `null`이다.
 *
 * 다 차기 전에 재지 않는 이유는 방향 때문이다. 표본이 셋뿐일 때 둘이 감겨 있으면 비율이 0.67이
 * 되어, 깜빡임 두 번으로 졸음이 선다. 깨어 있는데 졸음으로 잡는 쪽을 막으려면 창이 찰 때까지
 * 기다리는 편이 낫다.
 *
 * ⚠️ 연속 규칙과 달리 **원표본을 그대로 센다.** 다듬기를 먼저 씌우지 않는다는 뜻이고,
 * 이것은 PERCLOS가 "눈이 감겨 있던 시간의 비율"로 정의되기 때문이다 — 평활을 먼저 씌우면 재려던
 * 시간 자체가 뭉개진다. 대가는 방향이 나쁜 쪽이다. 깜빡임 한 표본도 감김으로 세어지므로 비율이
 * 조금씩 부풀고, 44초에 22번 넘게 깜빡이면 그것만으로도 비율이 오른다. 그 부풀음을 감당하는 것은
 * 창 길이(44초)와 문턱(0.5), 그리고 어댑터가 뜬 눈이 이어지면 창을 비우는 규칙이다. 실기기에서
 * 깨어 있는 구간의 비율이 문턱에 붙으면 문턱을 올린다.
 */
export function eyeClosedRatio(readings: readonly number[], threshold: number): number | null {
  if (readings.length < EYE_RATIO_WINDOW_SAMPLES) {
    return null;
  }
  const window = readings.slice(readings.length - EYE_RATIO_WINDOW_SAMPLES);
  return window.filter((reading) => reading >= threshold).length / window.length;
}

/** 2026-09-20 실측으로 정한 판정. 임계는 사람마다 보정된 값이고 근거는 `visionConfig.ts`에 있다. */
export const defaultSleepRule: SleepRule = {
  evaluate(frame) {
    if (!frame.personPresent) {
      // 자리에 사람이 없으면 자리 이탈이 가져간다. 얼굴 신호는 관측 자체가 불확실하다.
      return NO_SLEEP_SIGNALS;
    }
    const threshold = frame.eyeClosureThreshold;
    if (threshold === null) {
      // 보정 전이다. 이 사람의 뜬 눈이 몇 점인지 모르는 채로 판정하면 뜬 눈이 높은 사람이
      // 세션 시작 직후 졸음으로 찍힌다. 판정을 쉬는 쪽이 오탐 0 원칙과 같은 방향이다.
      return NO_SLEEP_SIGNALS;
    }
    const closure = smoothedEyeClosure(frame.faceSamples);
    const ratio = eyeClosedRatio(frame.eyeReadings, threshold);
    return {
      eyesClosed: closure !== null && closure >= threshold,
      // 꾸벅거리는 사람은 한 번에 몇 초씩만 감아 연속 판정의 유지시간을 영영 못 채운다. 그
      // 사이사이 뜬 눈이 유지시간을 계속 0으로 되돌리기 때문이다. 같은 1분을 합쳐서 보면
      // 절반 넘게 감겨 있으므로, 연속이 아니라 비율로 한 번 더 본다.
      eyesDrowsy: ratio !== null && ratio >= EYE_RATIO_THRESHOLD,
    };
  },
};

export function evaluateSleep(frame: SleepFrame, rule: SleepRule = defaultSleepRule): SleepSignals {
  return rule.evaluate(frame);
}
