import {
  EYE_CALIBRATION_DELTA,
  EYE_CALIBRATION_PERCENTILE,
  EYE_CALIBRATION_SAMPLES,
  EYE_THRESHOLD_MAX,
  EYE_THRESHOLD_MIN,
} from "./visionConfig";

/**
 * 눈 감김 임계를 사람마다 맞춘다 — 순수 함수만 있다.
 *
 * 고정 임계 하나로는 사람을 가린다. 눈이 작은 사람은 뜨고 있어도 점수가 높아 깨어 있는데
 * 졸음으로 잡히고, 눈이 큰 사람은 감아도 점수가 낮아 자고 있는데 놓친다. 그래서 그 사람의
 * 뜬 눈이 실제로 몇 점인지를 먼저 재고, 거기서 일정 간격 위를 감김으로 본다.
 *
 * 상태는 들지 않는다. 표본을 모으는 것은 어댑터의 몫이고 여기서는 받은 표본만 본다.
 */

/** 이 사람의 보정 결과. `baseline`은 뜬 눈 기준, `threshold`는 거기서 유도한 감김 임계다. */
export interface EyeCalibration {
  /** 지금까지 다 채운 보정 창의 수. 측정 도구와 패널이 보정이 실제로 돌았는지 볼 때 쓴다. */
  readonly windows: number;
  readonly baseline: number;
  readonly threshold: number;
}

/**
 * 뜬 눈 기준을 고른다.
 *
 * 평균이 아니라 낮은 쪽 백분위를 쓰는 것은, 보정 중에 사용자에게 눈을 뜨라고 시키지 않기
 * 때문이다. 깜빡임과 잠깐의 감김이 표본에 섞이는데 그것들은 점수가 높은 쪽에 몰리므로,
 * 낮은 쪽을 보면 그 오염이 기준을 밀어 올리지 못한다.
 *
 * 표준 nearest-rank 정의를 쓴다 — 오름차순에서 `ceil(백분위 × 개수)`번째, 0부터 세는 인덱스로는
 * 하나 앞이다. 보간하지 않는 것은 실제로 관측된 값이어야 임계와 직접 비교할 수 있기 때문이고,
 * `measurement.ts`의 백분위도 같은 정의를 쓴다. 인덱스를 하나 밀어 쓰면 경계에서 답이 뒤집힌다 —
 * 뜬 눈이 정확히 다섯 중 하나인 표본에서 기준이 뜬 눈이 아니라 감김으로 잡힌다.
 */
function baselineOf(sorted: readonly number[]): number {
  const rank = Math.ceil(EYE_CALIBRATION_PERCENTILE * sorted.length);
  return sorted[Math.max(0, rank - 1)] ?? 0;
}

/**
 * 창 하나가 찼을 때 직전 보정과 합쳐 새 보정을 낸다. 창이 덜 찼으면 `null`이다.
 *
 * ## 세션 내내 계속 배운다
 *
 * 한 번 재고 잠그지 않는다. 호출부는 창이 찰 때마다 표본을 비우고 다시 모아 이 함수를 부르고,
 * **지금까지 본 기준값 중 가장 낮은 값**이 살아남는다.
 *
 * 한 번만 재면 첫 30초가 세션 전체를 정한다. 앉자마자 자는 사람은 표본이 전부 감김이라 그 값이
 * 그 사람의 "뜬 눈" 기준이 되고, 임계가 그 위로 올라가 **세션이 끝날 때까지 감김이 안 잡힌다.**
 * 계속 배우면 깨어난 뒤 다음 창에서 낮은 값이 나와 기준이 스스로 내려온다.
 *
 * 기준값이 내려가기만 하는 것은 방향 때문이다. 올라갈 수 있게 두면 조는 동안의 높은 점수가
 * 기준을 밀어 올려, 자고 있을수록 임계가 올라가는 쪽으로 돈다. 내려가기만 하면 임계는 시간이
 * 갈수록 그 사람의 진짜 뜬 눈 기준 쪽으로만 움직인다.
 *
 * ⚠️ 이전에는 기준값이 고정 임계 이상이면 그 보정을 거부했다. **되돌리지 말 것** — 거부 기준이
 * 고정 임계라는 것이 순환이었다. 눈이 작아 뜬 눈이 원래 0.45 이상인 사람은 보정이 영영 거부돼
 * 고정 임계로 돌아가고, 뜨고 있어도 세션 내내 졸음으로 찍힌다. 이 티켓이 고치려던 바로 그
 * 사람이다.
 */
export function calibrateEye(
  readings: readonly number[],
  previous: EyeCalibration | null,
): EyeCalibration | null {
  if (readings.length < EYE_CALIBRATION_SAMPLES) {
    return null;
  }
  // 길이는 위에서 보장했으므로 `baselineOf`는 반드시 값을 준다.
  const sorted = [...readings.slice(0, EYE_CALIBRATION_SAMPLES)].sort((a, b) => a - b);
  const measured = baselineOf(sorted);
  const baseline = previous === null ? measured : Math.min(previous.baseline, measured);
  const threshold = Math.min(
    EYE_THRESHOLD_MAX,
    Math.max(EYE_THRESHOLD_MIN, baseline + EYE_CALIBRATION_DELTA),
  );
  return { windows: (previous?.windows ?? 0) + 1, baseline, threshold };
}
