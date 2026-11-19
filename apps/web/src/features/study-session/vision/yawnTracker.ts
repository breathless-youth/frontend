import { YAWN_EDGE, YAWN_END_HOLD_MS, YAWN_MIN_PEAK } from "./visionConfig";

/**
 * 하품 판정 — **순수 함수**다. 상태는 호출부가 든 `YawnState`뿐이다.
 *
 * 입 벌림이 `YAWN_EDGE` 이상이면 시작, `YAWN_END_HOLD_MS` 동안 계속 그 아래면 끝이다. 끝 시각은 마지막으로
 * 기준을 넘은 표본이다. 최고값이 `YAWN_MIN_PEAK`에 못 미치면 버린다. 근거는 `visionConfig.ts`의 하품 기준 주석.
 */

export interface YawnState {
  /** 진행 중인 하품의 시작 시각. 없으면 null. */
  readonly startMs: number | null;
  /** 마지막으로 기준을 넘은 표본 시각. */
  readonly lastHighMs: number;
  readonly peak: number;
}

export interface Yawn {
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly peak: number;
}

export const EMPTY_YAWN_STATE: YawnState = { startMs: null, lastHighMs: 0, peak: 0 };

/** 표본 하나를 넣는다. 얼굴이 안 보이면 `jaw`는 null이고 입을 다문 것으로 본다. 하품이 끝나면 `yawn`에 싣는다. */
export function stepYawn(
  state: YawnState,
  jaw: number | null,
  nowMs: number,
): { state: YawnState; yawn: Yawn | null } {
  if (jaw !== null && jaw >= YAWN_EDGE) {
    return {
      state: {
        startMs: state.startMs ?? nowMs,
        lastHighMs: nowMs,
        peak: Math.max(state.peak, jaw),
      },
      yawn: null,
    };
  }
  if (state.startMs === null || nowMs - state.lastHighMs < YAWN_END_HOLD_MS) {
    return { state, yawn: null };
  }
  const yawn =
    state.peak >= YAWN_MIN_PEAK
      ? { startedAtMs: state.startMs, endedAtMs: state.lastHighMs, peak: state.peak }
      : null;
  return { state: EMPTY_YAWN_STATE, yawn };
}
