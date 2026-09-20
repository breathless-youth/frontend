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

/**
 * 감지 원신호의 출처. 트리거(사용자·서버가 보는 단위)보다 한 단계 아래다.
 *
 * 지금은 셋 다 출처가 하나라 이름이 트리거와 같다. 출처가 둘인 트리거가 들어오면
 * 여기에 출처를 추가하고 `SOURCE_TRIGGER`로 트리거에 묶는다. 출처마다 유지시간이 다를 수
 * 있어서 판정은 출처 단위로 하고 트리거 단위로 합친다. 유지시간 판정은 이 모듈 한 곳뿐이다.
 * 어댑터가 출처를 미리 합치거나 자체 디바운스를 두지 않는다.
 */
export const DETECTION_SOURCES = ["AWAY", "PHONE", "DEVICE", "SLEEP_EYES", "SLEEP_DROWSY"] as const;
export type DetectionSource = (typeof DETECTION_SOURCES)[number];

/**
 * 출처 → 트리거. 모든 출처는 정확히 하나의 트리거에 속한다.
 * `satisfies`가 출처 누락을 컴파일 에러로 만든다. 트리거 쪽 누락은 테스트가 잡는다.
 */
export const SOURCE_TRIGGER = {
  AWAY: "AWAY",
  PHONE: "PHONE",
  DEVICE: "DEVICE",
  SLEEP_EYES: "SLEEP",
  SLEEP_DROWSY: "SLEEP",
} as const satisfies Record<DetectionSource, DistractionTrigger>;

/** 출처별 유지시간. */
export type DetectionParams = Record<DetectionSource, TriggerHoldParams>;

/**
 * 감지 파라미터 기본값 — `ai-wiki/product/mvp-scope.md` "감지 파라미터"(M1 테스트로 튜닝 예정).
 * 하드코딩하지 말고 이 객체를 주입해 바꾼다.
 */
export const DEFAULT_DETECTION_PARAMS: DetectionParams = {
  AWAY: { enterMs: 1500, exitMs: 2000 },
  PHONE: { enterMs: 500, exitMs: 1500 },
  DEVICE: { enterMs: 500, exitMs: 2000 },
  /**
   * ⚠️ 잠정값이다. 2026-09-20 스파이크는 피험자가 한 명이라 앱 안 측정에서 다시 정한다.
   *
   * 눈 감김은 감은 눈을 직접 보므로 10초면 충분하다. 마이크로슬립 정의(1~15초)의 위쪽이고,
   * 정상 깜빡임보다 한참 길다.
   * 해제 2초는 얼굴 틱 한 번 분량이다. 원신호가 이미 뜬 표본 하나로 내려오므로 여기서
   * 더 기다릴 이유가 없고, 2026-09-20 실측에서 3초는 체감으로 늦었다.
   */
  SLEEP_EYES: { enterMs: 10_000, exitMs: 2000 },
  /**
   * ⚠️ 잠정값이다. 진입이 유독 짧은 것은 원신호가 이미 1분 창의 비율로 평활돼 있기 때문이다.
   * 여기서 다시 오래 기다리면 1분을 재고 또 기다리는 셈이 되어 판정이 그만큼 늦는다. 얼굴 틱
   * 두 번이면 새 비율이 반영되므로 4초를 본다. 해제는 다른 졸음 출처와 같다.
   */
  SLEEP_DROWSY: { enterMs: 4000, exitMs: 2000 },
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
 *
 * `SLEEP`이 `DEVICE`보다 뒤인 것은 졸음 판정이 둘 다 카메라에서 나오기 때문이다. `PHONE`보다
 * 앞인 것은 책상에 올려둔 휴대폰이 계속 검출되는 알려진 오탐이 있는데, 10초 이상 유지된
 * 졸음이 그보다 구체적인 판정이기 때문이다.
 *
 * 값은 쓰지 않고 키 삽입 순서만 쓴다. `satisfies Record<DistractionTrigger, number>`가 새
 * 트리거의 누락을 컴파일 에러로 만든다. 여기서 빠진 트리거는 영원히 활성화되지 않은 채
 * 알림 없이 실패하기 때문이다.
 */
const TRIGGER_PRIORITY_RANK = {
  AWAY: 0,
  DEVICE: 1,
  SLEEP: 2,
  PHONE: 3,
} as const satisfies Record<DistractionTrigger, number>;

export const TRIGGER_PRIORITY = Object.keys(TRIGGER_PRIORITY_RANK) as readonly DistractionTrigger[];

/** 출처별 원신호. 이름은 호출부 호환을 위해 유지한다. 키는 출처다. */
export type TriggerSignals = Record<DetectionSource, boolean>;

function fillSources<T>(value: T): Record<DetectionSource, T> {
  const filled = {} as Record<DetectionSource, T>;
  for (const source of DETECTION_SOURCES) {
    filled[source] = value;
  }
  return filled;
}

export const NO_TRIGGER_SIGNALS: TriggerSignals = fillSources(false);

export interface DetectionState {
  /** 감지기가 마지막으로 보고한 원신호. */
  readonly signals: TriggerSignals;
  /** 각 원신호가 현재 값으로 바뀐 시각(유지시간 계산 기준). */
  readonly signalSinceMs: Record<DetectionSource, number>;
  /** 유지시간을 넘겨 "확정"된 출처. 트리거 확정은 `isTriggerConfirmed`로 파생한다. */
  readonly confirmed: TriggerSignals;
  /** 화면에 표시할 대표 트리거. 없으면 집중. */
  readonly active: DistractionTrigger | null;
}

export function createDetectionState(nowMs: number): DetectionState {
  return {
    signals: { ...NO_TRIGGER_SIGNALS },
    signalSinceMs: fillSources(nowMs),
    confirmed: { ...NO_TRIGGER_SIGNALS },
    active: null,
  };
}

/** 트리거가 확정됐는가 = 그 트리거에 속한 출처 중 하나라도 확정. */
function isTriggerConfirmed(confirmed: TriggerSignals, trigger: DistractionTrigger): boolean {
  return DETECTION_SOURCES.some(
    (source) => SOURCE_TRIGGER[source] === trigger && confirmed[source],
  );
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
  const nextSince: Record<DetectionSource, number> = { ...state.signalSinceMs };
  const nextConfirmed: TriggerSignals = { ...state.confirmed };

  for (const source of DETECTION_SOURCES) {
    const raw = signals[source];
    if (raw !== state.signals[source]) {
      nextSignals[source] = raw;
      nextSince[source] = nowMs;
    }
    const heldMs = nowMs - nextSince[source];
    const hold = params[source];
    if (raw && !nextConfirmed[source] && heldMs >= hold.enterMs) {
      nextConfirmed[source] = true;
    }
    if (!raw && nextConfirmed[source] && heldMs >= hold.exitMs) {
      nextConfirmed[source] = false;
    }
  }

  const active =
    state.active !== null && isTriggerConfirmed(nextConfirmed, state.active)
      ? state.active
      : (TRIGGER_PRIORITY.find((trigger) => isTriggerConfirmed(nextConfirmed, trigger)) ?? null);

  const unchanged =
    active === state.active &&
    DETECTION_SOURCES.every(
      (source) =>
        nextSignals[source] === state.signals[source] &&
        nextConfirmed[source] === state.confirmed[source],
    );

  return unchanged
    ? state
    : { signals: nextSignals, signalSinceMs: nextSince, confirmed: nextConfirmed, active };
}
