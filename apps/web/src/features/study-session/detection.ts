import type { DistractionTrigger } from "./sessionState";

/**
 * 비집중 감지 판정 — 순수 TS. 감지기(Vision·가속도 센서)의 **원신호**를 받아
 * 유지시간(hold time)을 적용해 "지금 화면에 표시할 대표 트리거"를 계산한다.
 *
 * 감지 수단 자체는 어댑터(`adapters/focusDetector.ts`) 뒤에 있고, 이 모듈은 시간 판정만 한다.
 */

export interface TriggerHoldParams {
  /** 원신호가 이만큼 연속 유지되면 비집중으로 진입한다. */
  readonly enterMs: number;
  /** 원신호가 이만큼 연속 해제되면 자동 재개한다. */
  readonly exitMs: number;
}

export type DetectionParams = Record<DistractionTrigger, TriggerHoldParams>;

/**
 * 감지 파라미터 기본값 — `ai-wiki/product/mvp-scope.md` "감지 파라미터"(M1 테스트로 튜닝 예정).
 * 하드코딩하지 말고 이 객체를 주입해 바꾼다.
 */
export const DEFAULT_DETECTION_PARAMS: DetectionParams = {
  AWAY: { enterMs: 1500, exitMs: 2000 },
  PHONE: { enterMs: 500, exitMs: 1500 },
  DEVICE: { enterMs: 500, exitMs: 2000 },
};

/**
 * 동시 다중 감지 시 대표 트리거 선택 순서 — **`AWAY` > `DEVICE` > `PHONE`**(2026-07-26 확정,
 * 세션 상태 모델 스펙 §3).
 *
 * `StatusEventPayload`는 status 하나만 갖고 구간이 서로 겹칠 수 없어서, 자리 이탈 중 기기
 * 조작이 겹치면 어느 쪽으로 기록할지 정해야 했다. 자리에 없으면 나머지 판정은 관측 자체가
 * 불확실하므로 `AWAY`가 최상위다. `DEVICE`가 `PHONE`보다 앞서는 것은 가속도 신호가 카메라
 * 객체 인식보다 오탐이 적고, **기기가 흔들리는 동안에는 카메라 기반 판정을 신뢰하기 어렵기**
 * 때문이다.
 *
 * 적용 방식은 (a) 이미 활성인 트리거를 해제 전까지 유지하고 (b) 새로 고를 때만 이 순서를 쓴다.
 */
export const TRIGGER_PRIORITY: readonly DistractionTrigger[] = ["AWAY", "DEVICE", "PHONE"];

export type TriggerSignals = Record<DistractionTrigger, boolean>;

export const NO_TRIGGER_SIGNALS: TriggerSignals = { AWAY: false, PHONE: false, DEVICE: false };

export interface DetectionState {
  /** 감지기가 마지막으로 보고한 원신호. */
  readonly signals: TriggerSignals;
  /** 각 원신호가 현재 값으로 바뀐 시각(유지시간 계산 기준). */
  readonly signalSinceMs: Record<DistractionTrigger, number>;
  /** 유지시간을 넘겨 "확정"된 트리거. */
  readonly confirmed: TriggerSignals;
  /** 화면에 표시할 대표 트리거. 없으면 집중. */
  readonly active: DistractionTrigger | null;
}

export function createDetectionState(nowMs: number): DetectionState {
  return {
    signals: { ...NO_TRIGGER_SIGNALS },
    signalSinceMs: { AWAY: nowMs, PHONE: nowMs, DEVICE: nowMs },
    confirmed: { ...NO_TRIGGER_SIGNALS },
    active: null,
  };
}

/**
 * 원신호 + 현재 시각으로 감지 상태를 한 스텝 진행한다.
 * 같은 신호로 반복 호출해도 되며(시간만 흐른다), 결과가 같으면 이전 객체를 그대로 돌려준다.
 */
export function stepDetection(
  state: DetectionState,
  signals: TriggerSignals,
  nowMs: number,
  params: DetectionParams = DEFAULT_DETECTION_PARAMS,
): DetectionState {
  const nextSignals: TriggerSignals = { ...state.signals };
  const nextSince: Record<DistractionTrigger, number> = { ...state.signalSinceMs };
  const nextConfirmed: TriggerSignals = { ...state.confirmed };

  for (const trigger of TRIGGER_PRIORITY) {
    const raw = signals[trigger];
    if (raw !== state.signals[trigger]) {
      nextSignals[trigger] = raw;
      nextSince[trigger] = nowMs;
    }
    const heldMs = nowMs - nextSince[trigger];
    const hold = params[trigger];
    if (raw && !nextConfirmed[trigger] && heldMs >= hold.enterMs) {
      nextConfirmed[trigger] = true;
    }
    if (!raw && nextConfirmed[trigger] && heldMs >= hold.exitMs) {
      nextConfirmed[trigger] = false;
    }
  }

  const active =
    state.active !== null && nextConfirmed[state.active]
      ? state.active
      : (TRIGGER_PRIORITY.find((trigger) => nextConfirmed[trigger]) ?? null);

  const unchanged =
    active === state.active &&
    TRIGGER_PRIORITY.every(
      (trigger) =>
        nextSignals[trigger] === state.signals[trigger] &&
        nextConfirmed[trigger] === state.confirmed[trigger],
    );

  return unchanged
    ? state
    : { signals: nextSignals, signalSinceMs: nextSince, confirmed: nextConfirmed, active };
}
