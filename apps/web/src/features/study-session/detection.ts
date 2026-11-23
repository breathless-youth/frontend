import type { StudyRoomType } from "@/lib/amplitude";

import type { DistractionTrigger } from "./sessionState";

/**
 * 비집중 감지 판정 — 순수 TS. 감지기(Vision·가속도 센서)의 **원신호**를 받아
 * 유지시간(hold time)을 적용해 "지금 화면에 표시할 대표 트리거"를 계산한다.
 *
 * 감지 수단 자체는 어댑터(`adapters/focusDetector.ts`) 뒤에 있고, 이 모듈은 시간 판정만 한다.
 */

/**
 * 출처 하나의 유지시간
 *
 * 원신호가 `graceMs` 이어지면 유예, 처음 켜진 때부터 `enterMs`가 지나면 비집중으로 확정한다.
 * 유예와 비집중은 원신호가 `exitMs` 동안 꺼져 있어야 풀린다.
 * 유예 중 원신호가 잠깐 꺼져도 `exitMs`를 못 채우면 확정까지의 시간은 처음 켜진 때부터 계속 잰다.
 */
export interface TriggerHoldParams {
  readonly graceMs: number;
  /** null이면 유예까지만 가고 비집중으로 확정하지 않는다. */
  readonly enterMs: number | null;
  readonly exitMs: number;
  /**
   * 참이면 확정도 끊김 없이 `enterMs` 이어져야 한다. 유예 중 한 번 꺼지면 확정까지의 시간을 처음부터 다시 잰다.
   * 연속으로 이어진 조작만 세는 가속도 신호가 쓴다.
   */
  readonly continuous?: boolean;
  /** 이 출처를 기록할 트리거. 없으면 `SOURCE_TRIGGER`를 따른다. 방마다 같은 출처를 다르게 기록할 때 쓴다. */
  readonly trigger?: DistractionTrigger;
  /**
   * 비집중이 풀린 직후 이 시간 동안은 이 출처가 유예를 만들지 않는다.
   * 자리에 돌아와 책을 펴고 얼굴이 잡히기까지 걸리는 시간이다. 이 시간이 지난 뒤부터 `graceMs`를 잰다.
   */
  readonly settleMs?: number;
  /**
   * 참이면 강한 공부 증거(`WORKING`)가 켜지는 순간 이 출처의 유예를 바로 푼다. 확정된 비집중은 풀지 않는다.
   * 공부 증거로 판정하는 출처만 쓴다.
   */
  readonly clearedByWork?: boolean;
}

/**
 * 감지 원신호의 출처. 트리거(사용자·서버가 보는 단위)보다 한 단계 아래다.
 *
 * 출처마다 유지시간을 따로 재고 트리거 단위로 합친다. 유지시간 판정은 이 모듈 한 곳뿐이다.
 * 어댑터가 출처를 미리 합치거나 자체 디바운스를 두지 않는다.
 *
 * - `DEVICE`: 가속도 센서가 폰을 들거나 흔든 동안 켜진다. 폰을 손에 든 것이라 휴대폰 사용으로 센다.
 * - `TOUCH`: 세션 화면을 계속 만지는 중이다.
 * - `SCREEN_GAZE`: 고개와 눈을 합친 시선이 폰 카메라 쪽이다. 10초 이어지면 화면 응시(`SCREEN`) 비집중이다.
 *   고개 방향만 보면 폰을 정면에 두고 공부하는 사람도 계속 켜져서, 눈 방향까지 더해 카메라 쪽인지 본다.
 * - `NO_EVIDENCE`: 공부 증거(도구 쪽 시선·손, 얼굴)가 없다. 10초 이어지면 자세 이탈(`POSTURE`) 비집중이다.
 *   얼굴이 보일 때와 안 보일 때를 같은 원인으로 기록한다.
 * - `WORKING`: 얼굴이 안 보일 때 도구 위에서 손이 필기·타이핑하듯 움직인다. 유예를 만들지 않고,
 *   켜지면 `clearedByWork` 출처의 유예를 3초 기다리지 않고 바로 푼다.
 */
export const DETECTION_SOURCES = [
  "AWAY",
  "PHONE",
  "DEVICE",
  "SLEEP_EYES",
  "SLEEP_DROWSY",
  "TOUCH",
  "SCREEN_GAZE",
  "NO_EVIDENCE",
  "WORKING",
] as const;
export type DetectionSource = (typeof DETECTION_SOURCES)[number];

/**
 * 출처 → 트리거. null인 출처는 비집중 사유가 없어 유예만 만든다.
 * `satisfies`가 출처 누락을 컴파일 에러로 만든다. 트리거 쪽 누락은 테스트가 잡는다.
 */
export const SOURCE_TRIGGER = {
  AWAY: "AWAY",
  PHONE: "PHONE",
  DEVICE: "PHONE",
  SLEEP_EYES: "SLEEP",
  SLEEP_DROWSY: "SLEEP",
  TOUCH: "DEVICE",
  SCREEN_GAZE: "SCREEN",
  NO_EVIDENCE: "POSTURE",
  WORKING: null,
} as const satisfies Record<DetectionSource, DistractionTrigger | null>;

/** 출처별 유지시간. */
export type DetectionParams = Record<DetectionSource, TriggerHoldParams>;

/**
 * 유예 3초 · 비집중 10초 · 복귀 3초
 *
 * 세 값 모두 원신호가 켜지거나 꺼진 시각부터 잰다. 비집중은 유예가 뜨고 7초 뒤, 신호가 켜지고 10초 뒤에 확정된다.
 * 유예는 규칙 원안의 범위(3~5초) 중 짧은 쪽이고, 복귀는 3~5초로 정한 범위의 짧은 쪽이다.
 * 실기기에서 상태가 깜빡이면 복귀를 5초까지 올린다.
 * 확정이 10초라 1 fps 감지 주기보다 충분히 길어 샘플 사이로 신호가 빠져도 확정이 늦어질 뿐 사라지지 않는다.
 */
const STANDARD_HOLD: TriggerHoldParams = { graceMs: 3000, enterMs: 10_000, exitMs: 3000 };

/** 비집중에서 돌아온 뒤 화면 응시·공부 흔적 없음으로 유예를 띄우지 않는 시간. */
const SETTLE_AFTER_RELEASE_MS = 10_000;

/** 쓰지 않는 출처. 원신호가 와도 유예도 비집중도 만들지 않는다. */
const OFF_HOLD: TriggerHoldParams = { graceMs: Number.POSITIVE_INFINITY, enterMs: null, exitMs: 0 };

export const DEFAULT_DETECTION_PARAMS: DetectionParams = {
  AWAY: STANDARD_HOLD,
  /**
   * 카메라 휴대폰은 손 결과 두 번으로 쥔 것을 확인해 원신호가 1초 늦게 켜진다. 그만큼 1초씩 줄여
   * 휴대폰을 집은 순간부터 보면 다른 원인과 같은 3초 유예·10초 확정이 되게 한다.
   */
  PHONE: { ...STANDARD_HOLD, graceMs: 2000, enterMs: 9000 },
  /**
   * 조작이 1초 이어지면 유예, 4초 이어지면 휴대폰 사용이다. 중간에 끊기면 처음부터 다시 잰다.
   * 1초에 한 번 본다고 치면 2회 연속이 유예, 5회 연속이 확정인 것과 같다.
   */
  DEVICE: { graceMs: 1000, enterMs: 4000, exitMs: STANDARD_HOLD.exitMs, continuous: true },
  SLEEP_EYES: STANDARD_HOLD,
  SLEEP_DROWSY: STANDARD_HOLD,
  TOUCH: STANDARD_HOLD,
  SCREEN_GAZE: { ...STANDARD_HOLD, settleMs: SETTLE_AFTER_RELEASE_MS, clearedByWork: true },
  NO_EVIDENCE: {
    ...STANDARD_HOLD,
    settleMs: SETTLE_AFTER_RELEASE_MS,
    clearedByWork: true,
  },
  WORKING: OFF_HOLD,
};

/**
 * 이 방이 유예와 공부 흔적 판정(손 모델)을 쓰는지. 지금은 싱글룸만 쓴다.
 * 감지기 옵션과 감지 시간 기본값이 같이 따르므로 두 곳이 어긋나지 않게 여기 한 곳에서 정한다.
 */
export function usesStudyEvidence(roomType: StudyRoomType): boolean {
  return roomType === "single";
}

/**
 * 소셜·그룹룸 유지시간
 *
 * 유예와 공부 흔적 판정은 싱글룸에만 쓰고, 소셜·그룹룸은 유예를 도입하기 전 판정을 그대로 둔다.
 * `graceMs`를 `enterMs`와 같게 두면 유예가 뜨는 순간 바로 확정되어 유예 구간이 보이지 않는다.
 * 프레임 주기 1초와 짝인 값이다. 자리 비움은 한 프레임 놓침으로 확정되지 않게 주기의 2배, 휴대폰은 주기와 같다.
 * 가속도(기기 흔들림)는 예전처럼 기기 조작으로 기록한다.
 * 터치·화면 응시·흔적 없음은 소셜룸 감지기가 내보내지 않지만, 와도 아무 판정을 하지 않게 끈다.
 */
export const SOCIAL_DETECTION_PARAMS: DetectionParams = {
  AWAY: { graceMs: 2000, enterMs: 2000, exitMs: 2000 },
  PHONE: { graceMs: 1000, enterMs: 1000, exitMs: 1500 },
  DEVICE: { graceMs: 500, enterMs: 500, exitMs: 2000, trigger: "DEVICE" },
  SLEEP_EYES: { graceMs: 10_000, enterMs: 10_000, exitMs: 2000 },
  SLEEP_DROWSY: { graceMs: 4000, enterMs: 4000, exitMs: 2000 },
  TOUCH: OFF_HOLD,
  SCREEN_GAZE: OFF_HOLD,
  NO_EVIDENCE: OFF_HOLD,
  WORKING: OFF_HOLD,
};

/**
 * 동시 다중 감지 시 대표 트리거 선택 순서 — **`AWAY` > `DEVICE` > `PHONE`**(2026-07-26 확정,
 * 세션 상태 모델 스펙 §3).
 *
 * `StatusEventPayload`는 status 하나만 갖고 구간이 서로 겹칠 수 없어서, 자리 이탈 중 기기
 * 조작이 겹치면 어느 쪽으로 기록할지 정해야 했다. 자리에 없으면 나머지 판정은 관측 자체가
 * 불확실하므로 `AWAY`가 최상위다. `DEVICE`(화면 조작)는 사용자가 지금 이 화면을 만지고 있다는
 * 직접 신호라 `PHONE`보다 앞선다. `PHONE`은 손에 쥔 휴대폰(카메라)과 이 휴대폰의 움직임(가속도,
 * `SOURCE_TRIGGER` 참고)에서 온다.
 *
 * 적용 방식은 (a) 이미 활성인 트리거를 해제 전까지 유지하고 (b) 새로 고를 때만 이 순서를 쓴다.
 *
 * `SLEEP`이 `DEVICE`보다 뒤인 것은 졸음 판정이 둘 다 카메라에서 나오기 때문이다. `PHONE`보다
 * 앞인 것은 책상에 올려둔 휴대폰이 계속 검출되는 알려진 오탐이 있는데, 10초 이상 유지된
 * 졸음이 그보다 구체적인 판정이기 때문이다. `SCREEN`(화면 응시)은 시선만으로 정하는 덜 구체적인
 * 판정이고, `POSTURE`(자세 이탈)는 공부 흔적을 찾지 못했다는 판정이라 가장 뒤다.
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
  SCREEN: 4,
  POSTURE: 5,
} as const satisfies Record<DistractionTrigger, number>;

export const TRIGGER_PRIORITY = Object.keys(TRIGGER_PRIORITY_RANK) as readonly DistractionTrigger[];

/** 출처별 원신호. 키는 출처다. */
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
  /** 유예나 비집중이 시작된 원신호의 첫 시각. null이면 그 출처는 집중이다. */
  readonly episodeSinceMs: Record<DetectionSource, number | null>;
  /** 확정 시간을 넘긴 출처. 트리거 확정은 `isTriggerConfirmed`로 파생한다. */
  readonly confirmed: TriggerSignals;
  /** 화면에 표시할 대표 트리거. 없으면 집중이나 유예다. */
  readonly active: DistractionTrigger | null;
  /** 확정된 트리거는 없고 유예 중인 출처가 있다. 순공은 그대로 흐른다. */
  readonly grace: boolean;
  /** 마지막으로 비집중이 풀린 시각. `settleMs`의 기준이다. */
  readonly releasedAtMs: number | null;
}

export function createDetectionState(nowMs: number): DetectionState {
  return {
    signals: { ...NO_TRIGGER_SIGNALS },
    signalSinceMs: fillSources(nowMs),
    episodeSinceMs: fillSources<number | null>(null),
    confirmed: { ...NO_TRIGGER_SIGNALS },
    active: null,
    grace: false,
    releasedAtMs: null,
  };
}

/**
 * 지금 켜진 원신호를 방금 켜진 것으로 보고 유예·확정을 처음부터 다시 센다.
 *
 * 일시정지·휴식 동안에도 유지시간은 흐르므로, 그대로 이어 가면 멈추기 전의 유예가 재개 직후 확정된다.
 * 신호를 지우지 않는 것은 감지기가 값이 바뀔 때만 알려 주기 때문이다. 지우면 이어지는 상황을 놓친다.
 */
export function restartDetection(signals: TriggerSignals, nowMs: number): DetectionState {
  return { ...createDetectionState(nowMs), signals: { ...signals } };
}

/** 트리거가 확정됐는가 = 그 트리거에 속한 출처 중 하나라도 확정. */
function isTriggerConfirmed(
  confirmed: TriggerSignals,
  trigger: DistractionTrigger,
  params: DetectionParams,
): boolean {
  return DETECTION_SOURCES.some(
    (source) => (params[source].trigger ?? SOURCE_TRIGGER[source]) === trigger && confirmed[source],
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
  const nextEpisode: Record<DetectionSource, number | null> = { ...state.episodeSinceMs };
  const nextConfirmed: TriggerSignals = { ...state.confirmed };

  for (const source of DETECTION_SOURCES) {
    const raw = signals[source];
    if (raw !== state.signals[source]) {
      nextSignals[source] = raw;
      nextSince[source] = nowMs;
    }
    const heldMs = nowMs - nextSince[source];
    const hold = params[source];
    let episode = nextEpisode[source];
    // 비집중이 풀린 뒤 정착 시간이 끝나기 전에는 유예까지의 시간을 재지 않는다.
    const settledAt =
      hold.settleMs !== undefined && state.releasedAtMs !== null
        ? Math.max(nextSince[source], state.releasedAtMs + hold.settleMs)
        : nextSince[source];
    if (episode === null && raw && nowMs - settledAt >= hold.graceMs) {
      episode = settledAt;
    }
    if (episode !== null && !raw && heldMs >= hold.exitMs) {
      episode = null;
    }
    // 강한 공부 증거가 켜지면 공부 증거로 판정하는 출처의 유예는 복귀 시간을 기다리지 않고 바로 푼다.
    // 이미 확정된 비집중은 다른 원인처럼 복귀 시간을 기다린다.
    if (
      episode !== null &&
      signals.WORKING &&
      hold.clearedByWork === true &&
      !nextConfirmed[source]
    ) {
      episode = null;
    }
    nextEpisode[source] = episode;
    const confirmFrom = hold.continuous === true ? nextSince[source] : episode;
    if (episode === null) {
      nextConfirmed[source] = false;
    } else if (
      raw &&
      hold.enterMs !== null &&
      confirmFrom !== null &&
      nowMs - confirmFrom >= hold.enterMs
    ) {
      nextConfirmed[source] = true;
    }
  }

  const active =
    state.active !== null && isTriggerConfirmed(nextConfirmed, state.active, params)
      ? state.active
      : (TRIGGER_PRIORITY.find((trigger) => isTriggerConfirmed(nextConfirmed, trigger, params)) ??
        null);
  let releasedAtMs = state.releasedAtMs;
  if (state.active !== null && active === null) {
    // 비집중 동안 쌓인 정착 대상 출처의 유예는 지운다. 돌아온 뒤 정착 시간부터 다시 잰다.
    releasedAtMs = nowMs;
    for (const source of DETECTION_SOURCES) {
      if (params[source].settleMs !== undefined) {
        nextEpisode[source] = null;
      }
    }
  }
  const grace = active === null && DETECTION_SOURCES.some((source) => nextEpisode[source] !== null);

  const unchanged =
    active === state.active &&
    grace === state.grace &&
    releasedAtMs === state.releasedAtMs &&
    DETECTION_SOURCES.every(
      (source) =>
        nextSignals[source] === state.signals[source] &&
        nextEpisode[source] === state.episodeSinceMs[source] &&
        nextConfirmed[source] === state.confirmed[source],
    );

  return unchanged
    ? state
    : {
        signals: nextSignals,
        signalSinceMs: nextSince,
        episodeSinceMs: nextEpisode,
        confirmed: nextConfirmed,
        active,
        grace,
        releasedAtMs,
      };
}
