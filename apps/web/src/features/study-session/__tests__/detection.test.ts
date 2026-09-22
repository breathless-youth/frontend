import { describe, expect, it } from "vitest";

import type { DetectionState, TriggerSignals } from "../detection";
import {
  DEFAULT_DETECTION_PARAMS,
  DETECTION_SOURCES,
  NO_TRIGGER_SIGNALS,
  SOURCE_TRIGGER,
  TRIGGER_PRIORITY,
  createDetectionState,
  stepDetection,
} from "../detection";

const T0 = 1_000_000;

function signals(overrides: Partial<TriggerSignals>): TriggerSignals {
  return { ...NO_TRIGGER_SIGNALS, ...overrides };
}

function step(state: DetectionState, raw: TriggerSignals, atMs: number): DetectionState {
  return stepDetection(state, raw, atMs, DEFAULT_DETECTION_PARAMS);
}

describe("stepDetection — 진입 유지시간", () => {
  it("자리 이탈은 1.5초 유지되어야 비집중으로 잡힌다", () => {
    let state = createDetectionState(T0);
    state = step(state, signals({ AWAY: true }), T0);
    expect(state.active).toBeNull();

    state = step(state, signals({ AWAY: true }), T0 + 1400);
    expect(state.active).toBeNull();

    state = step(state, signals({ AWAY: true }), T0 + 1500);
    expect(state.active).toBe("AWAY");
  });

  it("휴대폰 사용은 0.5초면 잡힌다", () => {
    let state = createDetectionState(T0);
    state = step(state, signals({ PHONE: true }), T0);
    state = step(state, signals({ PHONE: true }), T0 + 400);
    expect(state.active).toBeNull();

    state = step(state, signals({ PHONE: true }), T0 + 500);
    expect(state.active).toBe("PHONE");
  });

  it("유지시간을 채우기 전에 신호가 사라지면 잡히지 않는다", () => {
    let state = createDetectionState(T0);
    state = step(state, signals({ DEVICE: true }), T0);
    state = step(state, signals({}), T0 + 300);
    state = step(state, signals({}), T0 + 2000);
    expect(state.active).toBeNull();
  });
});

describe("stepDetection — 자동 재개", () => {
  it("신호 해제가 유지시간을 넘기면 사용자 확인 없이 집중으로 돌아온다", () => {
    let state = createDetectionState(T0);
    state = step(state, signals({ PHONE: true }), T0);
    state = step(state, signals({ PHONE: true }), T0 + 500);
    expect(state.active).toBe("PHONE");

    state = step(state, signals({}), T0 + 600);
    expect(state.active).toBe("PHONE"); // 해제 유지시간(1.5초) 전에는 유지

    state = step(state, signals({}), T0 + 2100);
    expect(state.active).toBeNull();
  });
});

describe("stepDetection — 동시 다중 감지", () => {
  it("이미 활성인 대표 트리거를 해제 전까지 유지한다", () => {
    let state = createDetectionState(T0);
    state = step(state, signals({ PHONE: true }), T0);
    state = step(state, signals({ PHONE: true }), T0 + 500);
    expect(state.active).toBe("PHONE");

    // 자리 이탈이 뒤늦게 겹쳐 확정(1.5초)되어도 대표 트리거는 바뀌지 않는다.
    state = step(state, signals({ PHONE: true, AWAY: true }), T0 + 600);
    state = step(state, signals({ PHONE: true, AWAY: true }), T0 + 2200);
    expect(state.active).toBe("PHONE");
  });

  it("대표 트리거가 풀리면 남아 있는 확정 트리거로 넘어간다", () => {
    let state = createDetectionState(T0);
    state = step(state, signals({ PHONE: true }), T0);
    state = step(state, signals({ PHONE: true }), T0 + 600);
    expect(state.active).toBe("PHONE");

    // 자리 이탈이 겹쳐 확정(1.5초)되어도 대표는 PHONE 유지.
    state = step(state, signals({ PHONE: true, AWAY: true }), T0 + 600);
    state = step(state, signals({ PHONE: true, AWAY: true }), T0 + 2200);
    expect(state.active).toBe("PHONE");

    // PHONE 원신호만 해제 → 해제 유지시간(1.5초) 뒤 남아 있는 AWAY가 대표가 된다.
    state = step(state, signals({ AWAY: true }), T0 + 2300);
    state = step(state, signals({ AWAY: true }), T0 + 3900);
    expect(state.active).toBe("AWAY");
  });
});

describe("stepDetection — 트리거 우선순위 (2026-07-26 확정)", () => {
  it("AWAY > DEVICE > SLEEP > PHONE 순으로 대표를 고른다", () => {
    expect(TRIGGER_PRIORITY).toEqual(["AWAY", "DEVICE", "SLEEP", "PHONE"]);
  });

  /**
   * 기기가 흔들리는 동안에는 카메라 기반 판정을 신뢰하기 어렵다 — 가속도 신호가 객체 인식보다
   * 오탐이 적으므로 겹치면 `DEVICE`가 이긴다(세션 상태 모델 스펙 §3).
   */
  it("기기 조작과 폰 사용이 같은 시점에 확정되면 DEVICE가 대표가 된다", () => {
    let state = createDetectionState(T0);
    state = step(state, signals({ DEVICE: true, PHONE: true }), T0);
    state = step(state, signals({ DEVICE: true, PHONE: true }), T0 + 500);
    expect(state.active).toBe("DEVICE");
  });

  it("자리 이탈은 기기 조작보다 앞선다", () => {
    let state = createDetectionState(T0);
    state = step(state, signals({ AWAY: true, DEVICE: true }), T0);
    state = step(state, signals({ AWAY: true, DEVICE: true }), T0 + 1500);
    expect(state.active).toBe("AWAY");
  });
});

describe("stepDetection — 참조 안정성", () => {
  it("변화가 없으면 같은 객체를 돌려준다(불필요한 리렌더 방지)", () => {
    const state = createDetectionState(T0);
    expect(step(state, signals({}), T0 + 5000)).toBe(state);
  });
});

describe("출처 계층 불변식", () => {
  it("원신호 키 집합은 DETECTION_SOURCES와 같다", () => {
    expect(Object.keys(NO_TRIGGER_SIGNALS).sort()).toEqual([...DETECTION_SOURCES].sort());
  });

  it("모든 트리거는 출처를 하나 이상 가진다", () => {
    const triggersWithSource = new Set(Object.values(SOURCE_TRIGGER));
    expect(triggersWithSource).toEqual(new Set(TRIGGER_PRIORITY));
  });
});

describe("stepDetection — 졸음", () => {
  it("눈 감김은 10초 유지되어야 잡힌다", () => {
    let state = createDetectionState(T0);
    state = step(state, signals({ SLEEP_EYES: true }), T0);
    state = step(state, signals({ SLEEP_EYES: true }), T0 + 9_999);
    expect(state.active).toBeNull();

    state = step(state, signals({ SLEEP_EYES: true }), T0 + 10_000);
    expect(state.active).toBe("SLEEP");
  });

  it("두 출처가 각각 확정돼도 대표 트리거는 SLEEP 하나다", () => {
    let state = createDetectionState(T0);
    const both = signals({ SLEEP_EYES: true, SLEEP_DROWSY: true });
    state = step(state, both, T0);
    state = step(state, both, T0 + 10_000);

    expect(state.active).toBe("SLEEP");
    expect(state.confirmed.SLEEP_EYES).toBe(true);
    expect(state.confirmed.SLEEP_DROWSY).toBe(true);
  });

  it("한 출처만 풀려도 나머지가 살아 있으면 졸음을 유지한다", () => {
    let state = createDetectionState(T0);
    const both = signals({ SLEEP_EYES: true, SLEEP_DROWSY: true });
    state = step(state, both, T0);
    state = step(state, both, T0 + 10_000);

    // 연속 감김은 풀렸지만 꾸벅거림 비율은 아직 절반을 넘는다.
    const drowsyOnly = signals({ SLEEP_DROWSY: true });
    state = step(state, drowsyOnly, T0 + 10_000);
    state = step(state, drowsyOnly, T0 + 15_000);

    expect(state.active).toBe("SLEEP");
  });

  it("두 출처가 모두 풀리면 집중으로 돌아온다", () => {
    let state = createDetectionState(T0);
    const both = signals({ SLEEP_EYES: true, SLEEP_DROWSY: true });
    state = step(state, both, T0);
    state = step(state, both, T0 + 10_000);
    expect(state.active).toBe("SLEEP");

    const none = signals({});
    state = step(state, none, T0 + 10_000);

    // 두 출처 모두 해제 유지가 2초다. 그 전에는 졸음이 남는다.
    state = step(state, none, T0 + 11_999);
    expect(state.active).toBe("SLEEP");

    state = step(state, none, T0 + 12_000);
    expect(state.active).toBeNull();
  });

  it("눈 감김은 뜬 뒤 2초에 풀린다 — 실측에서 3초는 체감이 늦었다", () => {
    let state = createDetectionState(T0);
    const eyes = signals({ SLEEP_EYES: true });
    state = step(state, eyes, T0);
    state = step(state, eyes, T0 + 10_000);
    expect(state.active).toBe("SLEEP");

    const none = signals({});
    state = step(state, none, T0 + 10_000);
    state = step(state, none, T0 + 11_999);
    expect(state.active).toBe("SLEEP");

    state = step(state, none, T0 + 12_000);
    expect(state.active).toBeNull();
  });
});

describe("stepDetection — 꾸벅거림 출처", () => {
  it("4초 유지되어야 잡힌다 — 원신호가 이미 30초 창으로 평활돼 있다", () => {
    let state = createDetectionState(T0);
    state = step(state, signals({ SLEEP_DROWSY: true }), T0);
    state = step(state, signals({ SLEEP_DROWSY: true }), T0 + 3_999);
    expect(state.active).toBeNull();

    state = step(state, signals({ SLEEP_DROWSY: true }), T0 + 4_000);
    expect(state.active).toBe("SLEEP");
  });

  it("꾸벅거림도 뜬 뒤 2초에 풀린다 — 눈 감김 출처와 같은 해제다", () => {
    let state = createDetectionState(T0);
    state = step(state, signals({ SLEEP_DROWSY: true }), T0);
    state = step(state, signals({ SLEEP_DROWSY: true }), T0 + 4_000);
    expect(state.active).toBe("SLEEP");

    state = step(state, signals({}), T0 + 4_000);
    state = step(state, signals({}), T0 + 5_999);
    expect(state.active).toBe("SLEEP");

    state = step(state, signals({}), T0 + 6_000);
    expect(state.active).toBeNull();
  });

  it("눈 감김 출처와 같은 트리거로 합쳐진다", () => {
    expect(SOURCE_TRIGGER.SLEEP_DROWSY).toBe("SLEEP");
    let state = createDetectionState(T0);
    const both = signals({ SLEEP_EYES: true, SLEEP_DROWSY: true });
    state = step(state, both, T0);
    state = step(state, both, T0 + 10_000);
    expect(state.active).toBe("SLEEP");
  });
});

describe("stepDetection — 졸음과 다른 트리거", () => {
  it("기기 조작이 졸음보다 앞선다 — 흔들리는 동안은 카메라 판정을 믿기 어렵다", () => {
    let state = createDetectionState(T0);
    const both = signals({ DEVICE: true, SLEEP_EYES: true });
    state = step(state, both, T0);
    state = step(state, both, T0 + 10_000);

    expect(state.active).toBe("DEVICE");
  });

  it("휴대폰이 먼저 확정되면 졸음이 확정돼도 대표를 유지한다", () => {
    let state = createDetectionState(T0);
    const both = signals({ PHONE: true, SLEEP_EYES: true });
    state = step(state, both, T0);

    // 0.5초에 휴대폰이 혼자 확정돼 대표가 된다.
    state = step(state, both, T0 + 600);
    expect(state.active).toBe("PHONE");

    // 10초에 졸음이 확정돼도 이미 활성인 트리거를 유지한다.
    state = step(state, both, T0 + 10_000);
    expect(state.active).toBe("PHONE");

    // 휴대폰을 치우면 집중이 아니라 졸음으로 넘어간다.
    const sleepOnly = signals({ SLEEP_EYES: true });
    state = step(state, sleepOnly, T0 + 10_000);
    state = step(state, sleepOnly, T0 + 11_500);
    expect(state.active).toBe("SLEEP");
  });

  it("같은 틱에 함께 확정되면 졸음이 휴대폰을 이긴다", () => {
    let state = createDetectionState(T0);
    const both = signals({ PHONE: true, SLEEP_EYES: true });
    state = step(state, both, T0);
    state = step(state, both, T0 + 10_000);

    expect(state.active).toBe("SLEEP");
  });
});
