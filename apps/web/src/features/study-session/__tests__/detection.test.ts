import { describe, expect, it } from "vitest";

import type { DetectionState, TriggerSignals } from "../detection";
import {
  DEFAULT_DETECTION_PARAMS,
  DETECTION_SOURCES,
  NO_TRIGGER_SIGNALS,
  SOCIAL_DETECTION_PARAMS,
  SOURCE_TRIGGER,
  TRIGGER_PRIORITY,
  createDetectionState,
  stepDetection,
} from "../detection";

const T0 = 1_000_000;

function signals(overrides: Partial<TriggerSignals>): TriggerSignals {
  return { ...NO_TRIGGER_SIGNALS, ...overrides };
}

/** 같은 원신호를 `from`부터 `to`까지 1초 간격으로 넣는다. 감지 주기 1 fps와 같은 간격이다. */
function hold(
  state: DetectionState,
  raw: TriggerSignals,
  from: number,
  to: number,
): DetectionState {
  let next = stepDetection(state, raw, T0 + from, DEFAULT_DETECTION_PARAMS);
  for (let at = from + 1000; at <= to; at += 1000) {
    next = stepDetection(next, raw, T0 + at, DEFAULT_DETECTION_PARAMS);
  }
  return next;
}

describe("stepDetection — 집중에서 유예로", () => {
  it("비집중 원신호가 3초 이어지면 유예가 되고 대표 트리거는 아직 없다", () => {
    let state = hold(createDetectionState(T0), signals({ AWAY: true }), 0, 2000);
    expect(state.grace).toBe(false);

    state = hold(state, signals({ AWAY: true }), 3000, 3000);
    expect(state.grace).toBe(true);
    expect(state.active).toBeNull();
  });

  it("3초를 못 채우고 꺼지면 유예도 없다", () => {
    let state = hold(createDetectionState(T0), signals({ PHONE: true }), 0, 2000);
    state = hold(state, signals({}), 2500, 8000);
    expect(state.grace).toBe(false);
    expect(state.active).toBeNull();
  });
});

describe("stepDetection — 유예에서 비집중으로", () => {
  it("처음 켜진 때부터 10초가 지나면 비집중으로 확정한다", () => {
    let state = hold(createDetectionState(T0), signals({ AWAY: true }), 0, 9000);
    expect(state.active).toBeNull();
    expect(state.grace).toBe(true);

    state = hold(state, signals({ AWAY: true }), 10_000, 10_000);
    expect(state.active).toBe("AWAY");
    expect(state.grace).toBe(false);
  });

  it("유예 중 원신호가 잠깐 꺼져도 확정 시간은 처음부터 다시 세지 않는다", () => {
    let state = hold(createDetectionState(T0), signals({ SLEEP_EYES: true }), 0, 5000);
    // 감지가 두 번 빗나간다. 복귀 3초를 못 채우므로 유예가 유지된다.
    state = hold(state, signals({}), 6000, 7000);
    expect(state.grace).toBe(true);

    state = hold(state, signals({ SLEEP_EYES: true }), 8000, 10_000);
    expect(state.active).toBe("SLEEP");
  });

  it("공부 증거 없음은 유예까지만 가고 비집중으로 확정하지 않는다", () => {
    const state = hold(createDetectionState(T0), signals({ NO_EVIDENCE: true }), 0, 60_000);
    expect(state.grace).toBe(true);
    expect(state.active).toBeNull();
  });
});

describe("stepDetection — 집중으로 복귀", () => {
  it("유예는 공부가 3초 이어져야 풀린다", () => {
    let state = hold(createDetectionState(T0), signals({ PHONE: true }), 0, 4000);
    expect(state.grace).toBe(true);

    state = hold(state, signals({}), 5000, 7000);
    expect(state.grace).toBe(true);

    state = hold(state, signals({}), 8000, 8000);
    expect(state.grace).toBe(false);
  });

  it("비집중도 공부가 3초 이어져야 풀리고 그 사이에는 비집중이 남는다", () => {
    let state = hold(createDetectionState(T0), signals({ AWAY: true }), 0, 10_000);
    expect(state.active).toBe("AWAY");

    state = hold(state, signals({}), 11_000, 13_000);
    expect(state.active).toBe("AWAY");

    state = hold(state, signals({}), 14_000, 14_000);
    expect(state.active).toBeNull();
    expect(state.grace).toBe(false);
  });

  it("풀린 뒤 다시 켜지면 확정 시간을 처음부터 잰다", () => {
    let state = hold(createDetectionState(T0), signals({ PHONE: true }), 0, 4000);
    state = hold(state, signals({}), 5000, 10_000);
    expect(state.grace).toBe(false);

    state = hold(state, signals({ PHONE: true }), 11_000, 20_000);
    expect(state.active).toBeNull();
    state = hold(state, signals({ PHONE: true }), 21_000, 21_000);
    expect(state.active).toBe("PHONE");
  });
});

describe("stepDetection — 화면 조작 출처", () => {
  it("화면 터치는 기기 조작으로 확정된다", () => {
    expect(SOURCE_TRIGGER.TOUCH).toBe("DEVICE");
    const state = hold(createDetectionState(T0), signals({ TOUCH: true }), 0, 10_000);
    expect(state.active).toBe("DEVICE");
  });

  it("폰을 정면에 두고 공부해 화면 응시가 계속 켜져도 유예에서 멈춘다", () => {
    const state = hold(createDetectionState(T0), signals({ SCREEN_GAZE: true }), 0, 120_000);
    expect(state.grace).toBe(true);
    expect(state.active).toBeNull();
  });

  it("한 출처가 풀려도 같은 트리거의 다른 출처가 확정돼 있으면 유지한다", () => {
    const both = signals({ SLEEP_EYES: true, SLEEP_DROWSY: true });
    let state = hold(createDetectionState(T0), both, 0, 10_000);
    state = hold(state, signals({ SLEEP_DROWSY: true }), 11_000, 20_000);
    expect(state.active).toBe("SLEEP");
  });
});

describe("stepDetection — 가속도", () => {
  it("가속도는 휴대폰 사용으로 센다", () => {
    expect(SOURCE_TRIGGER.DEVICE).toBe("PHONE");
  });

  it("조작이 순간이면 아무 일도 없고 1초 이어지면 유예다", () => {
    let state = hold(createDetectionState(T0), signals({ DEVICE: true }), 0, 0);
    expect(state.grace).toBe(false);
    state = hold(state, signals({ DEVICE: true }), 1000, 1000);
    expect(state.grace).toBe(true);
    expect(state.active).toBeNull();
  });

  it("4초 이어지면 휴대폰 사용으로 확정한다", () => {
    let state = hold(createDetectionState(T0), signals({ DEVICE: true }), 0, 3000);
    expect(state.active).toBeNull();
    state = hold(state, signals({ DEVICE: true }), 4000, 4000);
    expect(state.active).toBe("PHONE");
  });

  it("중간에 한 번 끊기면 확정까지 처음부터 다시 센다", () => {
    let state = hold(createDetectionState(T0), signals({ DEVICE: true }), 0, 2000);
    state = hold(state, signals({}), 3000, 3000);
    state = hold(state, signals({ DEVICE: true }), 4000, 7000);
    expect(state.grace).toBe(true);
    expect(state.active).toBeNull();
    state = hold(state, signals({ DEVICE: true }), 8000, 8000);
    expect(state.active).toBe("PHONE");
  });
});

describe("stepDetection — 동시 다중 감지", () => {
  it("이미 활성인 대표 트리거를 해제 전까지 유지한다", () => {
    let state = hold(createDetectionState(T0), signals({ PHONE: true }), 0, 10_000);
    expect(state.active).toBe("PHONE");

    state = hold(state, signals({ PHONE: true, AWAY: true }), 11_000, 25_000);
    expect(state.active).toBe("PHONE");
  });

  it("대표 트리거가 풀리면 남아 있는 확정 트리거로 넘어간다", () => {
    let state = hold(createDetectionState(T0), signals({ PHONE: true }), 0, 10_000);
    state = hold(state, signals({ PHONE: true, AWAY: true }), 11_000, 22_000);
    state = hold(state, signals({ AWAY: true }), 23_000, 28_000);
    expect(state.active).toBe("AWAY");
  });

  it("같은 시점에 확정되면 AWAY > DEVICE > SLEEP > PHONE 순으로 고른다", () => {
    expect(TRIGGER_PRIORITY).toEqual(["AWAY", "DEVICE", "SLEEP", "PHONE"]);
    const state = hold(
      createDetectionState(T0),
      signals({ TOUCH: true, PHONE: true, SLEEP_EYES: true }),
      0,
      10_000,
    );
    expect(state.active).toBe("DEVICE");
  });

  it("비집중이 확정되면 다른 출처가 유예 중이어도 유예로 표시하지 않는다", () => {
    let state = hold(createDetectionState(T0), signals({ AWAY: true }), 0, 10_000);
    state = hold(state, signals({ AWAY: true, NO_EVIDENCE: true }), 11_000, 15_000);
    expect(state.active).toBe("AWAY");
    expect(state.grace).toBe(false);
  });
});

describe("stepDetection — 참조 안정성", () => {
  it("변화가 없으면 같은 객체를 돌려준다(불필요한 리렌더 방지)", () => {
    const state = createDetectionState(T0);
    expect(stepDetection(state, signals({}), T0 + 5000)).toBe(state);
  });
});

describe("출처 계층 불변식", () => {
  it("원신호 키 집합은 DETECTION_SOURCES와 같다", () => {
    expect(Object.keys(NO_TRIGGER_SIGNALS).sort()).toEqual([...DETECTION_SOURCES].sort());
  });

  it("모든 트리거는 출처를 하나 이상 가진다", () => {
    const triggersWithSource = new Set(
      Object.values(SOURCE_TRIGGER).filter((trigger) => trigger !== null),
    );
    expect(triggersWithSource).toEqual(new Set(TRIGGER_PRIORITY));
  });
});

describe("소셜룸 감지 시간 — 유예 없이 예전 시간에 비집중", () => {
  /** 같은 원신호를 `from`부터 `to`까지 0.5초 간격으로 넣는다. */
  function holdSocial(state: DetectionState, raw: TriggerSignals, from: number, to: number) {
    let next = state;
    const seen: DetectionState[] = [];
    for (let at = from; at <= to; at += 500) {
      next = stepDetection(next, raw, T0 + at, SOCIAL_DETECTION_PARAMS);
      seen.push(next);
    }
    return { state: next, everGrace: seen.some((each) => each.grace) };
  }

  it("자리 비움은 2초, 휴대폰은 1초 이어지면 바로 비집중이고 그 사이 유예는 없다", () => {
    const away = holdSocial(createDetectionState(T0), signals({ AWAY: true }), 0, 2000);
    expect(away.state.active).toBe("AWAY");
    expect(away.everGrace).toBe(false);

    const phone = holdSocial(createDetectionState(T0), signals({ PHONE: true }), 0, 1000);
    expect(phone.state.active).toBe("PHONE");
    expect(phone.everGrace).toBe(false);
  });

  it("기기 흔들림은 0.5초 이어지면 휴대폰이 아니라 기기 조작으로 기록한다", () => {
    const shaking = holdSocial(createDetectionState(T0), signals({ DEVICE: true }), 0, 500);
    expect(shaking.state.active).toBe("DEVICE");
  });

  it("자리 비움은 2초 동안 신호가 꺼져야 풀린다", () => {
    let state = holdSocial(createDetectionState(T0), signals({ AWAY: true }), 0, 2000).state;
    state = holdSocial(state, signals({}), 2500, 4000).state;
    expect(state.active).toBe("AWAY");
    state = holdSocial(state, signals({}), 4500, 4500).state;
    expect(state.active).toBeNull();
  });

  it("공부 흔적 신호(화면 응시·흔적 없음·터치)는 소셜룸에서 아무것도 만들지 않는다", () => {
    const quiet = holdSocial(
      createDetectionState(T0),
      signals({ SCREEN_GAZE: true, NO_EVIDENCE: true, TOUCH: true }),
      0,
      20_000,
    );
    expect(quiet.state.active).toBeNull();
    expect(quiet.everGrace).toBe(false);
  });
});
