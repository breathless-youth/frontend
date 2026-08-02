/**
 * 기기 조작(`DEVICE`) 판정 — 순수 함수. 센서 SDK도 브리지도 모른다.
 *
 * **최근 300ms 창에서 가속도 크기 `‖a‖`의 표준편차가 임계를 넘으면 조작 중이다**
 * (설계 `2026-07-27-study-session-vision-pipeline-design.md` §5).
 *
 * 표준편차를 쓰는 이유는 **중력 방향에 무관**하기 때문이다. "`‖a‖`가 1g에서 벗어난 정도"는
 * 정지 시 정확히 1g를 읽는다는 가정에 기대는데 거치대 각도·책상 진동·센서 바이어스로 기준선이
 * 흔들려 기기마다 임계를 다시 잡아야 하고, 폰을 들고 가만히 있으면 다시 1g로 돌아와 놓친다.
 * 표준편차는 "가만히 있으면 흔들리지 않는다"만 보므로 어떤 각도에서도 같은 임계가 통한다.
 *
 * 유지시간 디바운스(0.5초/2초)는 **여기서 하지 않는다** — 웹의 `stepDetection`이 세 감지기를
 * 한 곳에서 판정한다(스펙 §3 "가속도 신호의 경계"). 이 모듈이 만드는 것은 원신호 boolean뿐이다.
 */

/** 창 길이. 사실상 고정값이다 — 튜닝 대상은 임계 하나다(설계 §5 "파라미터"). */
export const MOTION_WINDOW_MS = 300;

/** 샘플링 간격 = 20Hz. 창 안에 `MOTION_MIN_SAMPLES` 이상 들어가는 값이어야 한다. */
export const MOTION_SAMPLE_INTERVAL_MS = 50;

/**
 * 표준편차를 신뢰할 최소 표본 수. 이보다 적으면 판정하지 않는다(`false`) —
 * 구독 직후 표본 한두 개로 계산한 편차는 값이 아니라 잡음이다.
 */
export const MOTION_MIN_SAMPLES = 6;

/**
 * 조작 판정 임계 (단위: g — `expo-sensors`가 중력 정규화 값을 준다).
 *
 * ⚠️ **실기기 확정값이 아니다.** mvp-scope의 미확정 항목이며 스파이크에서 정한다(설계 §5).
 * 지금 값은 "거치된 기기의 센서 노이즈(~0.005g)보다 충분히 크고, 화면을 톡 건드리는 정도는
 * 잡는다"를 노린 출발점이다.
 */
export const MOTION_STDDEV_THRESHOLD = 0.03;

export interface AccelerationSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly atMs: number;
}

/** 최근 `MOTION_WINDOW_MS` 구간의 `‖a‖` 표본. 불변이다 — `pushSample`이 새 창을 돌려준다. */
export interface MotionWindow {
  readonly magnitudes: readonly number[];
  readonly timestamps: readonly number[];
}

export const EMPTY_MOTION_WINDOW: MotionWindow = { magnitudes: [], timestamps: [] };

export function accelerationMagnitude(sample: AccelerationSample): number {
  return Math.sqrt(sample.x * sample.x + sample.y * sample.y + sample.z * sample.z);
}

/**
 * 표본을 넣고 창 밖으로 밀려난 것을 버린다.
 *
 * 경계는 `atMs - windowMs` **초과**로 잡는다(이상이 아니라) — 정확히 창 길이만큼 떨어진
 * 표본은 이미 창을 벗어난 것이고, 포함시키면 20Hz에서 표본이 하나 더 들어와 창 길이가
 * 샘플링 간격만큼 늘어난다.
 */
export function pushSample(
  window: MotionWindow,
  sample: AccelerationSample,
  windowMs: number = MOTION_WINDOW_MS,
): MotionWindow {
  const cutoffMs = sample.atMs - windowMs;
  const magnitudes: number[] = [];
  const timestamps: number[] = [];
  for (let index = 0; index < window.timestamps.length; index += 1) {
    if (window.timestamps[index] > cutoffMs) {
      magnitudes.push(window.magnitudes[index]);
      timestamps.push(window.timestamps[index]);
    }
  }
  magnitudes.push(accelerationMagnitude(sample));
  timestamps.push(sample.atMs);
  return { magnitudes, timestamps };
}

/** 모표준편차(N으로 나눈다). 표본이 창을 통째로 채우므로 불편추정량을 쓸 이유가 없다. */
export function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  const mean = sum / values.length;
  let squaredSum = 0;
  for (const value of values) {
    const deviation = value - mean;
    squaredSum += deviation * deviation;
  }
  return Math.sqrt(squaredSum / values.length);
}

/** 지금 창이 "기기 조작 중"인가. 표본이 모자라면 `false`. */
export function isHandlingActive(
  window: MotionWindow,
  threshold: number = MOTION_STDDEV_THRESHOLD,
): boolean {
  if (window.magnitudes.length < MOTION_MIN_SAMPLES) {
    return false;
  }
  return standardDeviation(window.magnitudes) > threshold;
}
