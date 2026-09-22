import { HEAD_PITCH_DOWN_DEG, HEAD_PITCH_MEDIAN_SAMPLES } from "./visionConfig";

/**
 * 내려다봄 게이트 — **순수 함수**다. 상태는 호출부가 든 최근 각도 배열뿐이다.
 *
 * 카메라 기준 고개 각도의 최근 `HEAD_PITCH_MEDIAN_SAMPLES`틱 중앙값이 `HEAD_PITCH_DOWN_DEG` 이상이면
 * 눈 판정을 하지 않는다. 근거와 값은 `visionConfig.ts`의 `HEAD_PITCH_DOWN_DEG` 주석.
 *
 * 각도를 모르는 관측(자세 행렬 없음)은 배열에 넣지 않고, 아는 각도가 하나도 없으면 게이트를 걸지
 * 않는다 — 규칙이 없던 때의 동작이고, 행렬은 프로덕션에서 켜져 있다.
 */

/** 최근 각도에 이번 각도를 더한다. 표본 수만 든다. */
export function pushHeadPitch(recent: readonly number[], pitch: number | null): number[] {
  if (pitch === null) {
    return [...recent];
  }
  return [...recent, pitch].slice(-HEAD_PITCH_MEDIAN_SAMPLES);
}

/** 최근 각도의 중앙값. 표본이 없으면 null. */
export function headPitchMedian(recent: readonly number[]): number | null {
  if (recent.length === 0) {
    return null;
  }
  const sorted = [...recent].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
}

/** 고개 구간. `clear`는 감김을 세고, `down`(`HEAD_PITCH_DOWN_DEG` 이상)은 세지 않는다. 각도를 모르면 `clear`. */
export type HeadPitchZone = "clear" | "down";

export function headPitchZone(recent: readonly number[]): HeadPitchZone {
  const median = headPitchMedian(recent);
  return median !== null && median >= HEAD_PITCH_DOWN_DEG ? "down" : "clear";
}

/** 지금 내려다보고 있는가(`down` 구간). */
export function isLookingDown(recent: readonly number[]): boolean {
  return headPitchZone(recent) === "down";
}
