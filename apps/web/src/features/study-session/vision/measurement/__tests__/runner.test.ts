import { describe, expect, it, vi } from "vitest";

import {
  createReportingThermalTimer,
  createScenarioRunner,
  createThermalTimer,
  thermalStatusLine,
} from "../runner";
import type { MeasurementScenario } from "../scenarios";

const SCENARIOS: readonly MeasurementScenario[] = [
  {
    id: "T1",
    name: "졸음 진입",
    instruction: "눈을 감으세요",
    expected: "10초쯤에 졸음으로 전이해야 한다",
    prepareSec: 10,
    observeSec: 30,
  },
  {
    id: "T2",
    name: "깨어 있기",
    instruction: "눈을 뜨세요",
    expected: "졸음이 없어야 한다",
    prepareSec: 0,
    observeSec: 20,
  },
];

function fakeClock() {
  let now = 0;
  return {
    now: () => now,
    advance(sec: number) {
      now += sec * 1000;
    },
  };
}

const NO_STATS = {
  dropped: 0,
  objectP95: null,
  faceP95: null,
  overLimit: 0,
  segmentTransitions: 0,
};

describe("createScenarioRunner", () => {
  it("시작 전에는 시계가 돌지 않는다 — 앱 부팅에서 A1이 지나가 버리면 안 된다", () => {
    const clock = fakeClock();
    const onSegment = vi.fn();
    const runner = createScenarioRunner({ scenarios: SCENARIOS, now: clock.now, onSegment });

    clock.advance(600);
    runner.tick();

    expect(runner.state().idle).toBe(true);
    expect(runner.state().phase).toBe("prepare");
    expect(onSegment).not.toHaveBeenCalled();
  });

  it("start가 첫 시나리오를 열고 그때부터 시간을 센다", () => {
    const clock = fakeClock();
    const onSegment = vi.fn();
    const runner = createScenarioRunner({ scenarios: SCENARIOS, now: clock.now, onSegment });

    clock.advance(600);
    runner.start();

    expect(runner.state().idle).toBe(false);
    expect(runner.state().remainingSec).toBe(10);
    expect(onSegment).toHaveBeenCalledWith("T1 준비", SCENARIOS[0], "prepare");
  });

  it("준비가 끝나면 관찰 구간을 연다", () => {
    const clock = fakeClock();
    const onSegment = vi.fn();
    const runner = createScenarioRunner({ scenarios: SCENARIOS, now: clock.now, onSegment });

    runner.start();
    clock.advance(10);
    runner.tick();

    expect(runner.state().phase).toBe("observe");
    expect(onSegment).toHaveBeenLastCalledWith("T1 졸음 진입", SCENARIOS[0], "observe");
  });

  it("관찰이 끝나면 다음을 기다린다 — 판정하지 않는다", () => {
    const clock = fakeClock();
    const runner = createScenarioRunner({ scenarios: SCENARIOS, now: clock.now });

    runner.start();
    clock.advance(40);
    runner.tick();

    expect(runner.state().phase).toBe("done");
  });

  it("준비 시간이 0이면 곧바로 관찰이다", () => {
    const clock = fakeClock();
    const runner = createScenarioRunner({ scenarios: SCENARIOS, now: clock.now });

    runner.start();
    runner.next();

    expect(runner.state().phase).toBe("observe");
  });

  it("다시 돌리면 같은 시나리오를 처음부터 연다", () => {
    const clock = fakeClock();
    const onSegment = vi.fn();
    const runner = createScenarioRunner({ scenarios: SCENARIOS, now: clock.now, onSegment });

    runner.start();
    clock.advance(5);
    runner.repeat();

    expect(runner.state().remainingSec).toBe(10);
    expect(onSegment).toHaveBeenLastCalledWith("T1 준비", SCENARIOS[0], "prepare");
  });

  it("몇 번째인지와 전체 개수를 함께 돌려준다", () => {
    const clock = fakeClock();
    const runner = createScenarioRunner({ scenarios: SCENARIOS, now: clock.now });

    expect(runner.state()).toMatchObject({ index: 0, total: 2 });
  });

  it("시나리오가 비면 만들 때 던진다 — 없는 값을 단언으로 감추지 않는다", () => {
    expect(() => createScenarioRunner({ scenarios: [], now: () => 0 })).toThrow();
  });

  it("마지막 시나리오 다음은 끝이다", () => {
    const clock = fakeClock();
    const runner = createScenarioRunner({ scenarios: SCENARIOS, now: clock.now });

    runner.start();
    runner.next();
    runner.next();

    expect(runner.state().finished).toBe(true);
  });

  it("한 번의 tick이 준비와 관찰을 한꺼번에 넘길 수 있다 — 화면이 백그라운드에 있다 돌아온 경우", () => {
    const clock = fakeClock();
    const runner = createScenarioRunner({ scenarios: SCENARIOS, now: clock.now });

    runner.start();
    clock.advance(40);
    runner.tick();

    expect(runner.state().phase).toBe("done");
  });
});

/**
 * 발열 기준이 "16분 동안 어땠나"에서 "Serious까지 몇 분 걸렸나"로 바뀌었다. 그래서 상한이 없고,
 * 단계는 사람이 Instruments를 보고 누른다.
 */
describe("createThermalTimer", () => {
  it("1분마다 한 번씩 알린다 — Instruments 기록 시점을 놓치지 않게", () => {
    const clock = fakeClock();
    const onMinute = vi.fn();
    const timer = createThermalTimer({ now: clock.now, onMinute });

    timer.start();
    clock.advance(59);
    timer.tick();
    expect(onMinute).not.toHaveBeenCalled();

    clock.advance(1);
    timer.tick();
    expect(onMinute).toHaveBeenCalledWith(1);

    clock.advance(60);
    timer.tick();
    expect(onMinute).toHaveBeenLastCalledWith(2);
  });

  it("상한이 없다 — Serious가 올 때까지 계속 돈다", () => {
    const clock = fakeClock();
    const onMinute = vi.fn();
    const timer = createThermalTimer({ now: clock.now, onMinute });

    timer.start();
    clock.advance(40 * 60);
    timer.tick();

    expect(timer.state().running).toBe(true);
    expect(timer.state().elapsedSec).toBe(40 * 60);
    expect(onMinute).toHaveBeenLastCalledWith(40);
  });

  it("시작 전에는 돌지 않는다", () => {
    const clock = fakeClock();
    const onMinute = vi.fn();
    const timer = createThermalTimer({ now: clock.now, onMinute });

    clock.advance(600);
    timer.tick();

    expect(onMinute).not.toHaveBeenCalled();
    expect(timer.state().running).toBe(false);
  });

  it("누른 단계를 경과 시각과 함께 남긴다", () => {
    const clock = fakeClock();
    const timer = createThermalTimer({ now: clock.now });

    timer.start();
    clock.advance(130);
    timer.mark("fair");

    expect(timer.state().marks).toEqual([{ stage: "fair", atSec: 130 }]);
  });

  it("Serious를 누르면 회차의 기준값이 확정되고 분당 알림이 멈춘다", () => {
    const clock = fakeClock();
    const onMinute = vi.fn();
    const timer = createThermalTimer({ now: clock.now, onMinute });

    timer.start();
    clock.advance(11 * 60);
    timer.mark("serious");
    clock.advance(120);
    timer.tick();

    expect(timer.state().running).toBe(false);
    expect(timer.state().seriousAtSec).toBe(11 * 60);
    expect(timer.state().elapsedSec).toBe(11 * 60);
    expect(onMinute).not.toHaveBeenCalled();
  });

  it("Serious 뒤에도 Critical은 받는다 — 열이 오르는 곡선이 거기서 끝나지 않는다", () => {
    const clock = fakeClock();
    const timer = createThermalTimer({ now: clock.now });

    timer.start();
    clock.advance(600);
    timer.mark("serious");
    clock.advance(300);
    timer.mark("critical");

    expect(timer.state().marks).toEqual([
      { stage: "serious", atSec: 600 },
      { stage: "critical", atSec: 900 },
    ]);
  });

  it("Serious 뒤의 Fair는 받지 않는다 — 회차는 이미 끝났다", () => {
    const clock = fakeClock();
    const timer = createThermalTimer({ now: clock.now });

    timer.start();
    timer.mark("serious");
    timer.mark("fair");

    expect(timer.state().marks).toHaveLength(1);
  });

  it("잘못 누른 단계를 되돌린다 — Serious를 되돌리면 다시 돈다", () => {
    const clock = fakeClock();
    const timer = createThermalTimer({ now: clock.now });

    timer.start();
    clock.advance(60);
    timer.mark("serious");
    timer.undo();

    expect(timer.state().marks).toHaveLength(0);
    expect(timer.state().seriousAtSec).toBeNull();
    expect(timer.state().running).toBe(true);
  });

  it("되돌릴 것이 없으면 아무 일도 없다", () => {
    const clock = fakeClock();
    const timer = createThermalTimer({ now: clock.now });

    timer.start();
    timer.undo();

    expect(timer.state().marks).toHaveLength(0);
  });

  it("중단하면 그때까지 잰 값과 미도달 사실이 남는다", () => {
    const clock = fakeClock();
    const timer = createThermalTimer({ now: clock.now });

    timer.start();
    clock.advance(300);
    timer.mark("fair");
    timer.abort();
    clock.advance(120);

    expect(timer.state()).toMatchObject({ running: false, aborted: true, elapsedSec: 300 });
    expect(timer.state().seriousAtSec).toBeNull();
    expect(timer.state().marks).toHaveLength(1);
  });

  it("이미 끝난 회차는 중단을 받지 않는다 — 도달 시각과 미도달이 한 줄에 같이 찍히면 서로를 부정한다", () => {
    const clock = fakeClock();
    const timer = createThermalTimer({ now: clock.now });

    timer.start();
    clock.advance(600);
    timer.mark("serious");
    timer.abort();

    expect(timer.state().aborted).toBe(false);
    expect(timer.state().seriousAtSec).toBe(600);
  });

  it("Serious를 무른 뒤에는 다시 중단할 수 있다", () => {
    const clock = fakeClock();
    const timer = createThermalTimer({ now: clock.now });

    timer.start();
    clock.advance(600);
    timer.mark("serious");
    timer.undo();
    timer.abort();

    expect(timer.state().aborted).toBe(true);
  });

  it("다시 시작하면 회차 번호가 늘고 앞 회차의 단계가 남지 않는다", () => {
    const clock = fakeClock();
    const timer = createThermalTimer({ now: clock.now });

    timer.start();
    clock.advance(60);
    timer.mark("fair");
    timer.abort();
    timer.start();

    expect(timer.state()).toMatchObject({ round: 2, aborted: false, running: true });
    expect(timer.state().marks).toHaveLength(0);
  });
});

/**
 * 분당 알림이 실제로 콘솔 한 줄로 이어지는지 본다. 앞선 검토에서 배선이 빠진 채 지나갔던
 * 자리라, 배선 자체를 테스트가 붙잡는다.
 */
describe("createReportingThermalTimer", () => {
  const stats = { ...NO_STATS, dropped: 2, objectP95: 360, faceP95: 56 };

  it("1분이 지날 때마다 콘솔 한 줄이 나간다", () => {
    const clock = fakeClock();
    const lines: string[] = [];
    const timer = createReportingThermalTimer({
      now: clock.now,
      stats: () => stats,
      log: (line) => lines.push(line),
    });

    timer.start();
    clock.advance(60);
    timer.tick();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("1분");
    expect(lines[0]).toContain("drop=2");
    expect(lines[0]).toContain("360");
  });

  it("1분이 안 지나면 내지 않는다", () => {
    const clock = fakeClock();
    const lines: string[] = [];
    const timer = createReportingThermalTimer({
      now: clock.now,
      stats: () => stats,
      log: (line) => lines.push(line),
    });

    timer.start();
    clock.advance(30);
    timer.tick();

    expect(lines).toHaveLength(0);
  });

  it("단계와 중단이 바뀔 때마다 요약을 넘긴다 — 덩어리에 싣는 쪽이 받는다", () => {
    const clock = fakeClock();
    const summaries: { marks: readonly { stage: string }[] }[] = [];
    const timer = createReportingThermalTimer({
      now: clock.now,
      stats: () => stats,
      log: () => {},
      onSummary: (summary) => summaries.push(summary),
    });

    timer.start();
    clock.advance(120);
    timer.mark("fair");
    timer.abort();

    expect(summaries.length).toBeGreaterThanOrEqual(3);
    expect(summaries[summaries.length - 1]?.marks).toHaveLength(1);
  });
});

describe("thermalStatusLine", () => {
  const base = {
    round: 1,
    running: true,
    elapsedSec: 185,
    minute: 3,
    marks: [],
    aborted: false,
    seriousAtSec: null,
  };

  it("회차·경과 분·경과 시간·버린 틱·추론 상위값을 한 줄에 담는다", () => {
    const line = thermalStatusLine(base, {
      ...NO_STATS,
      dropped: 2,
      objectP95: 360,
      faceP95: 56,
    });

    expect(line).toContain("1회차");
    expect(line).toContain("3분");
    expect(line).toContain("3:05");
    expect(line).toContain("drop=2");
    expect(line).toContain("360");
    expect(line).toContain("56");
  });

  it("누적 근사값임을 이름으로 구분한다 — 분당 줄의 p95와 범위가 다르다", () => {
    expect(thermalStatusLine(base, NO_STATS)).toContain("누적p95~");
  });

  it("기록한 단계를 함께 보여준다", () => {
    const line = thermalStatusLine({ ...base, marks: [{ stage: "fair", atSec: 130 }] }, NO_STATS);

    expect(line).toContain("fair");
    expect(line).toContain("2:10");
  });

  it("상한을 넘은 표본이 있었다는 사실을 남긴다", () => {
    const line = thermalStatusLine(base, { ...NO_STATS, overLimit: 3 });

    expect(line).toContain("2초 초과 3회");
  });

  it("표본이 없으면 값을 지어내지 않는다", () => {
    expect(thermalStatusLine(base, NO_STATS)).toContain("-");
  });
});
