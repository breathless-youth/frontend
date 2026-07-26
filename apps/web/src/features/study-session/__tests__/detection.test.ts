import { describe, expect, it } from "vitest";

import type { DetectionState, TriggerSignals } from "../detection";
import {
  DEFAULT_DETECTION_PARAMS,
  NO_TRIGGER_SIGNALS,
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

    // 자리 이탈이 뒤늦게 겹쳐도 대표 트리거는 바뀌지 않는다.
    state = step(state, signals({ PHONE: true, AWAY: true }), T0 + 600);
    state = step(state, signals({ PHONE: true, AWAY: true }), T0 + 2200);
    expect(state.active).toBe("PHONE");
  });

  it("대표 트리거가 풀리면 남아 있는 확정 트리거로 넘어간다", () => {
    let state = createDetectionState(T0);
    state = step(state, signals({ PHONE: true }), T0);
    state = step(state, signals({ PHONE: true }), T0 + 600);
    expect(state.active).toBe("PHONE");

    // 자리 이탈이 겹쳐 확정되어도 대표는 PHONE 유지.
    state = step(state, signals({ PHONE: true, AWAY: true }), T0 + 600);
    state = step(state, signals({ PHONE: true, AWAY: true }), T0 + 2200);
    expect(state.active).toBe("PHONE");

    // PHONE 원신호만 해제 → 해제 유지시간(1.5초) 뒤 남아 있는 AWAY가 대표가 된다.
    state = step(state, signals({ AWAY: true }), T0 + 2300);
    state = step(state, signals({ AWAY: true }), T0 + 3900);
    expect(state.active).toBe("AWAY");
  });
});

describe("stepDetection — 참조 안정성", () => {
  it("변화가 없으면 같은 객체를 돌려준다(불필요한 리렌더 방지)", () => {
    const state = createDetectionState(T0);
    expect(step(state, signals({}), T0 + 5000)).toBe(state);
  });
});
