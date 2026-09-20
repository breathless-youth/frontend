import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Measurement } from "../measurement";
import { createMeasurement } from "../measurement";
import type { VisionDiagnostics } from "../../diagnostics";
import { mountMeasurementPanel } from "../panel";
import { createReportingThermalTimer, createScenarioRunner } from "../runner";
import type { MeasurementScenario } from "../scenarios";
import { totalScenarioSec } from "../scenarios";

const noop: VisionDiagnostics = {
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
    prepareSec: 10,
    observeSec: 30,
    expected: "10초쯤에 졸음으로 전이해야 한다",
  },
  {
    id: "T2",
    name: "깨어 있기",
    instruction: "눈을 뜨세요",
    prepareSec: 0,
    observeSec: 20,
    expected: "졸음이 없어야 한다",
  },
];

function setup(
  overrides: {
    rehearsal?: boolean;
    enabled?: boolean;
    copy?: () => Promise<void>;
    faceLostEnabled?: boolean;
    eyeCalibration?: { windows: number; baseline: number; threshold: number } | null;
  } = {},
) {
  let nowMs = 0;
  const now = () => nowMs;
  const measurement: Measurement = createMeasurement(noop, {
    now,
    eyeCalibration: () => overrides.eyeCalibration ?? null,
  });
  const runner = createScenarioRunner({ scenarios: SCENARIOS, now });
  // 배선은 프로덕션과 같은 것을 쓴다 — 패널만 따로 엮으면 실제 경로가 테스트를 비껴간다.
  const thermal = createReportingThermalTimer({
    now,
    stats: () => measurement.stats(),
    log: () => {},
    onSummary: (state) => measurement.setThermal(state),
  });
  runner.start();
  const panel = mountMeasurementPanel({
    measurement,
    runner,
    thermal,
    rehearsal: overrides.rehearsal ?? false,
    faceLostEnabled: overrides.faceLostEnabled ?? false,
    oneRoundSec: totalScenarioSec(SCENARIOS),
    enabled: overrides.enabled ?? true,
    copy: overrides.copy ?? (() => Promise.resolve()),
  });
  return {
    measurement,
    runner,
    thermal,
    panel,
    advance(sec: number) {
      nowMs += sec * 1000;
    },
  };
}

function panelText(): string {
  return document.querySelector("[data-measure-panel]")?.textContent ?? "";
}

function button(action: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`[data-measure-action="${action}"]`);
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("mountMeasurementPanel", () => {
  it("진단이 꺼져 있으면 붙지 않는다", () => {
    setup({ enabled: false });

    expect(document.querySelector("[data-measure-panel]")).toBeNull();
  });

  it("지금 시나리오의 번호·이름·안내와 남은 시간을 띄운다", () => {
    const { advance, panel } = setup();

    expect(panelText()).toContain("T1");
    expect(panelText()).toContain("졸음 진입");
    expect(panelText()).toContain("눈을 감으세요");
    expect(panelText()).toContain("10");

    advance(4);
    panel.refresh();
    expect(panelText()).toContain("6");
  });

  it("준비와 관찰을 구분해 보여준다", () => {
    const { advance, panel } = setup();

    expect(panelText()).toContain("준비");

    advance(10);
    panel.refresh();
    expect(panelText()).toContain("관찰");
  });

  it("다음 버튼이 다음 시나리오로 넘긴다", () => {
    const { panel } = setup();

    button("next")?.click();
    panel.refresh();

    expect(panelText()).toContain("T2");
  });

  it("다시 버튼이 같은 시나리오를 처음부터 돌린다", () => {
    const { advance, panel } = setup();

    advance(5);
    panel.refresh();
    button("repeat")?.click();
    panel.refresh();

    expect(panelText()).toContain("T1");
    expect(panelText()).toContain("준비 10초");
  });

  it("기대 문장을 안내 아래에 보여준다 — 판단은 하지 않는다", () => {
    setup();

    expect(panelText()).toContain("기대: 10초쯤에 졸음으로 전이해야 한다");
    expect(panelText()).not.toContain("통과");
    expect(panelText()).not.toContain("실패");
  });

  it("이 구간의 전이 건수만 보여준다", () => {
    const { measurement, panel } = setup();

    expect(panelText()).toContain("전이 0건");

    measurement.transition("FOCUS", "DISTRACTION:SLEEP", 1000);
    panel.refresh();

    expect(panelText()).toContain("전이 1건");
  });

  it("복사가 성공하면 복사됐다고 알린다", async () => {
    const copy = vi.fn(() => Promise.resolve());
    const { panel } = setup({ copy });

    button("copy")?.click();
    await Promise.resolve();
    panel.refresh();

    expect(copy).toHaveBeenCalledTimes(1);
    expect(panelText()).toContain("복사");
  });

  it("복사가 막히면 조용히 실패하지 않고 콘솔 명령을 안내한다", async () => {
    const copy = vi.fn(() => Promise.reject(new Error("denied")));
    const { panel } = setup({ copy });

    button("copy")?.click();
    await Promise.resolve();
    await Promise.resolve();
    panel.refresh();

    expect(panelText()).toContain("__focusonMeasure.dump()");
  });

  it("리허설이면 눈에 띄게 표시한다 — 본 측정 수치로 오인되면 안 된다", () => {
    setup({ rehearsal: true });

    expect(panelText()).toContain("리허설");
  });

  it("엎드림 감지가 꺼져 있으면 점검 줄에 표시한다", () => {
    setup({ faceLostEnabled: false });

    expect(panelText()).toContain("엎드림꺼짐");
  });

  it("엎드림 감지를 켜면 점검 줄에 표시하지 않는다", () => {
    setup({ faceLostEnabled: true });

    expect(panelText()).not.toContain("엎드림꺼짐");
  });

  it("보정 전에는 점검 줄이 보정중이라고 말한다", () => {
    setup();

    expect(panelText()).toContain("보정중");
  });

  it("보정이 끝나면 점검 줄이 보정ok로 바뀐다 — 임계가 언제 바뀌었는지 화면에서 보여야 한다", () => {
    setup({ eyeCalibration: { windows: 2, baseline: 0.2, threshold: 0.45 } });

    expect(panelText()).toContain("보정ok(2)");
  });

  it("사전 점검에서 준비 안 된 항목을 표시한다", () => {
    const { measurement, panel } = setup();

    expect(panelText()).toContain("대기");

    measurement.detectorReady("CPU", "int8");
    measurement.faceReady("CPU");
    measurement.cameraStream({ width: 1280, height: 720, aspectRatio: 1.78, facingMode: "user" });
    panel.refresh();

    expect(panelText()).toContain("1280x720");
  });

  it("발열 회차는 경과 시간과 버린 틱·추론 상위값을 보여준다", () => {
    const { advance, panel } = setup();

    button("thermal-start")?.click();
    advance(65);
    panel.refresh();

    expect(panelText()).toContain("발열");
    expect(panelText()).toContain("1:05");
    expect(panelText()).toContain("drop=");
  });

  it("열 단계 버튼 셋은 회차가 도는 동안에만 보인다", () => {
    const { panel } = setup();

    expect(button("thermal-fair")?.style.display).toBe("none");

    button("thermal-start")?.click();
    panel.refresh();

    expect(button("thermal-fair")?.style.display).toBe("");
    expect(button("thermal-serious")?.style.display).toBe("");
    expect(button("thermal-critical")?.style.display).toBe("");
    expect(button("thermal-undo")?.style.display).toBe("");
    expect(button("thermal-abort")?.style.display).toBe("");
  });

  it("버튼 노드를 다시 만들지 않는다 — 누르는 순간 사라지면 그 한 번이 그대로 손실이다", () => {
    const { advance, panel } = setup();

    const before = button("thermal-start");
    advance(3);
    panel.refresh();
    button("thermal-start")?.click();
    advance(3);
    panel.refresh();

    expect(button("thermal-start")).toBe(before);
    expect(button("thermal-serious")).toBe(
      document.querySelector('[data-measure-action="thermal-serious"]'),
    );
  });

  it("누른 단계를 경과 시각과 함께 보여준다", () => {
    const { advance, panel } = setup();

    button("thermal-start")?.click();
    advance(130);
    panel.refresh();
    button("thermal-fair")?.click();
    panel.refresh();

    expect(panelText()).toContain("fair");
    expect(panelText()).toContain("2:10");
  });

  it("Serious를 누르면 회차가 끝나고 Fair는 감춰진다", () => {
    const { advance, panel } = setup();

    button("thermal-start")?.click();
    advance(600);
    panel.refresh();
    button("thermal-serious")?.click();
    panel.refresh();

    expect(button("thermal-fair")?.style.display).toBe("none");
    expect(panelText()).toContain("Serious 10:00");
  });

  it("Serious 뒤에도 Critical과 되돌리기는 남는다", () => {
    const { advance, panel } = setup();

    button("thermal-start")?.click();
    advance(600);
    panel.refresh();
    button("thermal-serious")?.click();
    panel.refresh();

    expect(button("thermal-critical")?.style.display).toBe("");
    expect(button("thermal-undo")?.style.display).toBe("");

    advance(120);
    button("thermal-critical")?.click();
    panel.refresh();

    expect(panelText()).toContain("critical 12:00");
  });

  it("회차가 끝나면 중단 버튼을 감춘다 — 멀쩡히 잰 회차를 버리게 만들면 안 된다", () => {
    const { advance, panel } = setup();

    button("thermal-start")?.click();
    advance(600);
    panel.refresh();
    button("thermal-serious")?.click();
    panel.refresh();

    expect(button("thermal-abort")?.style.display).toBe("none");
    expect(panelText()).not.toContain("미도달");
  });

  it("중단하면 미도달로 남는다", () => {
    const { advance, panel } = setup();

    button("thermal-start")?.click();
    advance(120);
    panel.refresh();
    button("thermal-abort")?.click();
    panel.refresh();

    expect(panelText()).toContain("미도달");
  });

  it("발열 회차 요약이 계측으로 넘어간다 — 덩어리에 남는다", () => {
    const { advance, panel, measurement } = setup();

    button("thermal-start")?.click();
    advance(300);
    panel.refresh();
    button("thermal-serious")?.click();

    const dump = JSON.parse(measurement.dump()) as {
      thermalRounds: { seriousAtSec: number }[];
    };
    expect(dump.thermalRounds[0]?.seriousAtSec).toBe(300);
  });

  it("버튼 터치 타깃이 44픽셀 이상이다 — 실기기에서 열다섯 번 넘게 누른다", () => {
    setup();

    for (const action of ["next", "repeat", "copy", "thermal-start", "thermal-serious"]) {
      const element = button(action);
      expect(Number.parseInt(element?.style.minHeight ?? "0", 10)).toBeGreaterThanOrEqual(44);
      expect(Number.parseInt(element?.style.minWidth ?? "0", 10)).toBeGreaterThanOrEqual(44);
    }
  });

  it("자기 버튼 밖의 터치를 가로채지 않는다", () => {
    setup();
    const root = document.querySelector<HTMLElement>("[data-measure-panel]");

    expect(root?.style.pointerEvents).toBe("none");
    expect(button("next")?.style.pointerEvents).toBe("auto");
  });

  it("명시 역할을 주지 않는다 — 버튼의 암묵 역할 말고는 접근성 트리에 아무것도 더하지 않는다", () => {
    setup();
    const root = document.querySelector("[data-measure-panel]");

    expect(root?.hasAttribute("role")).toBe(false);
    expect(root?.querySelectorAll("[role]")).toHaveLength(0);
  });

  it("개발용 배너·복구 다이얼로그보다 아래에 쌓인다", () => {
    setup();
    const root = document.querySelector<HTMLElement>("[data-measure-panel]");

    expect(Number(root?.style.zIndex)).toBeLessThan(50);
  });

  it("destroy가 화면에서 걷어낸다", () => {
    const { panel } = setup();

    panel.destroy();

    expect(document.querySelector("[data-measure-panel]")).toBeNull();
  });
});
