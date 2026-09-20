import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FrameDiagnostics, VisionDiagnostics } from "../../diagnostics";
import type { MeasurementScenario } from "../scenarios";
import { FACE_BASELINE_SAMPLES } from "../../visionConfig";
import { rehearsalBaseline } from "../flags";
import { createMeasurementTools } from "../wiring";

/**
 * 배선 검증. 통로가 끊겨 있던 것이 1차 검토에서 거짓 통과를 만든 원인이라, 조각마다가 아니라
 * **이어진 상태**를 확인한다.
 */

const base: VisionDiagnostics = {
  detectorReady() {},
  detectorUnavailable() {},
  frame() {},
  frameDropped() {},
  faceReady() {},
  faceUnavailable() {},
  transition() {},
  cameraStream() {},
};

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

function frame(): FrameDiagnostics {
  return {
    personPresent: true,
    topScores: { person: 0.9 },
    awaySignal: false,
    phoneSignal: false,
    durationMs: 100,
    delegate: "CPU",
    face: null,
  };
}

function setup(overrides: { panelEnabled?: boolean; enabled?: boolean } = {}) {
  let nowMs = 0;
  const lines: string[] = [];
  const tools = createMeasurementTools({
    scenarios: SCENARIOS,
    now: () => nowMs,
    log: (line) => lines.push(line),
    base,
    enabled: overrides.enabled ?? true,
    rehearsal: false,
    panelEnabled: overrides.panelEnabled ?? true,
  });
  return {
    tools,
    lines,
    advance(sec: number) {
      nowMs += sec * 1000;
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createMeasurementTools", () => {
  it("첫 프레임 전에는 패널도 진행도 열리지 않는다", () => {
    const { tools, advance } = setup();

    advance(600);

    expect(tools.panel()).toBeNull();
    expect(tools.runner.state().idle).toBe(true);
    expect(document.querySelector("[data-measure-panel]")).toBeNull();
  });

  it("첫 프레임이 패널을 붙이고 진행 시계를 연다", () => {
    const { tools, advance } = setup();

    advance(600);
    tools.measurement.frame(frame());

    expect(tools.panel()).not.toBeNull();
    expect(tools.runner.state().idle).toBe(false);
    // 앱 부팅이 아니라 이 시점부터 첫 시나리오의 준비가 시작된다.
    expect(tools.runner.state().remainingSec).toBe(10);
    expect(document.querySelector("[data-measure-panel]")).not.toBeNull();
  });

  it("객체 검출기가 감지 불가로 확정돼도 패널이 붙는다 — 사전 점검이 알리려던 실패가 바로 이것이다", () => {
    const { tools } = setup();

    tools.measurement.detectorUnavailable("model fetch 404");

    expect(tools.panel()).not.toBeNull();
    expect(tools.runner.state().idle).toBe(false);
    expect(document.querySelector("[data-measure-panel]")?.textContent).toContain("⚠unavailable");
  });

  it("얼굴 모델 실패도 같은 신호다", () => {
    const { tools } = setup();

    tools.measurement.faceUnavailable("timeout");

    expect(tools.panel()).not.toBeNull();
  });

  it("신호가 여러 번 와도 패널은 한 번만 붙는다", () => {
    const { tools } = setup();

    tools.measurement.detectorUnavailable("model fetch 404");
    const first = tools.panel();
    tools.measurement.faceUnavailable("timeout");
    tools.measurement.frame(frame());

    expect(tools.panel()).toBe(first);
    expect(document.querySelectorAll("[data-measure-panel]")).toHaveLength(1);
  });

  it("첫 프레임 뒤 1분이 지나야 요약 줄이 나간다 — 세션 첫 프레임에 빈 줄을 내지 않는다", () => {
    const { tools, lines, advance } = setup();

    advance(600);
    tools.measurement.frame(frame());
    expect(lines).toHaveLength(0);

    advance(60);
    tools.measurement.frame(frame());

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("drop=");
  });

  it("진행기가 여는 구간이 시나리오 정보와 함께 덩어리에 남는다", () => {
    const { tools, advance } = setup();

    tools.measurement.frame(frame());
    advance(10);
    tools.runner.tick();
    tools.measurement.frame(frame());

    const dump = JSON.parse(tools.measurement.dump()) as {
      segments: { name: string; scenario: { id: string; expected: string } | null }[];
    };
    expect(dump.segments.map((segment) => segment.name)).toEqual(["T1 준비", "T1 졸음 진입"]);
    expect(dump.segments[1]?.scenario).toMatchObject({
      id: "T1",
      expected: "10초쯤에 졸음으로 전이해야 한다",
    });
  });

  it("세션 전이가 지금 구간의 전이 목록으로 들어간다", () => {
    const { tools, advance } = setup();

    tools.measurement.frame(frame());
    advance(10);
    tools.runner.tick();
    advance(12);
    tools.measurement.transition("FOCUS", "DISTRACTION:SLEEP", 22_000);

    const dump = JSON.parse(tools.measurement.dump()) as {
      segments: { transitions: { to: string; atSec: number }[] }[];
    };
    expect(dump.segments[1]?.transitions).toEqual([
      { from: "FOCUS", to: "DISTRACTION:SLEEP", atSec: 12 },
    ]);
    expect(tools.measurement.stats().segmentTransitions).toBe(1);
  });

  it("새 세션 신호가 구간의 출발 상태를 되돌린다", () => {
    const { tools, advance } = setup();

    tools.measurement.frame(frame());
    tools.measurement.transition("FOCUS", "DISTRACTION:SLEEP", 1000);
    tools.measurement.sessionStarted();
    advance(10);
    tools.runner.tick();

    const dump = JSON.parse(tools.measurement.dump()) as { segments: { entryLabel: string }[] };
    expect(dump.segments[1]?.entryLabel).toBe("FOCUS");
  });

  it("발열 회차의 분당 줄이 콘솔로 나가고 요약이 덩어리에 남는다", () => {
    const { tools, lines, advance } = setup();

    tools.measurement.frame(frame());
    tools.measurement.frameDropped();
    tools.measurement.frameDropped();
    tools.thermal.start();
    advance(60);
    tools.thermal.tick();
    advance(120);
    tools.thermal.mark("serious");

    // 이 줄의 숫자가 계측에서 온다는 것까지 본다. 부분 문자열만 보면 통계 공급을 상수로
    // 바꿔도 테스트가 지나간다.
    const minuteLine = lines.find((line) => line.includes("발열 1회차")) ?? "";
    expect(minuteLine).toContain("drop=2");
    expect(minuteLine).toContain(String(tools.measurement.stats().objectP95));
    const dump = JSON.parse(tools.measurement.dump()) as {
      thermalRounds: { seriousAtSec: number }[];
    };
    expect(dump.thermalRounds[0]?.seriousAtSec).toBe(180);
  });

  it("리허설 덩어리의 기준선 설정이 실제로 적용된 값이다", () => {
    let nowMs = 0;
    const tools = createMeasurementTools({
      scenarios: SCENARIOS,
      now: () => nowMs,
      log: () => {},
      base,
      enabled: true,
      rehearsal: true,
      panelEnabled: false,
    });
    nowMs += 1;

    const dump = JSON.parse(tools.measurement.dump()) as {
      rehearsal: boolean;
      config: { baselineSamples: number };
    };
    expect(dump.rehearsal).toBe(true);
    expect(dump.config.baselineSamples).toBe(rehearsalBaseline(true).samples);
    expect(dump.config.baselineSamples).toBeLessThan(FACE_BASELINE_SAMPLES);
  });

  it("패널이 꺼져 있어도 진행과 기록은 돈다", () => {
    const { tools, advance } = setup({ panelEnabled: false });

    tools.measurement.frame(frame());
    advance(10);
    tools.runner.tick();

    expect(document.querySelector("[data-measure-panel]")).toBeNull();
    expect(tools.runner.state().phase).toBe("observe");
  });

  it("진단이 꺼져 있으면 아무것도 모으지 않는다", () => {
    const { tools, advance } = setup({ enabled: false, panelEnabled: false });

    tools.measurement.frame(frame());
    advance(10);
    tools.measurement.transition("FOCUS", "DISTRACTION:SLEEP", 10_000);

    const dump = JSON.parse(tools.measurement.dump()) as { segments: unknown[] };
    expect(dump.segments).toHaveLength(0);
  });
});
