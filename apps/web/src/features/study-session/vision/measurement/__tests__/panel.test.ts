import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Measurement } from "../measurement";
import { createMeasurement } from "../measurement";
import type { VisionDiagnostics } from "../../diagnostics";
import { mountMeasurementPanel } from "../panel";
import { createReportingThermalTimer } from "../runner";
import type { FrameDiagnostics } from "../../diagnostics";
import { SEGMENT_BUTTONS } from "../panel";

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

function setup(
  overrides: {
    enabled?: boolean;
    copy?: () => Promise<void>;
    eyeCalibration?: { windows: number; baseline: number; threshold: number } | null;
  } = {},
) {
  let nowMs = 0;
  const now = () => nowMs;
  const measurement: Measurement = createMeasurement(noop, {
    now,
    eyeCalibration: () => overrides.eyeCalibration ?? null,
  });
  // 배선은 프로덕션과 같은 것을 쓴다 — 패널만 따로 엮으면 실제 경로가 테스트를 비껴간다.
  const thermal = createReportingThermalTimer({
    now,
    stats: () => measurement.stats(),
    log: () => {},
    onSummary: (state) => measurement.setThermal(state),
  });
  const panel = mountMeasurementPanel({
    measurement,
    thermal,
    enabled: overrides.enabled ?? true,
    copy: overrides.copy ?? (() => Promise.resolve()),
  });
  return {
    measurement,
    thermal,
    panel,
    advance(sec: number) {
      nowMs += sec * 1000;
    },
    now,
  };
}

function frame(overrides: Partial<FrameDiagnostics> = {}): FrameDiagnostics {
  return {
    personPresent: true,
    topScores: { person: 0.91 },
    awaySignal: false,
    phoneSignal: false,
    durationMs: 100,
    delegate: "CPU",
    face: null,
    ...overrides,
  };
}

/** 눈 표본이 있는 프레임. 값은 판정이 쓰는 두 눈 점수다. */
function eyeFrame(
  left: number,
  right: number,
  overrides: Partial<FrameDiagnostics> = {},
): FrameDiagnostics {
  return frame({
    eyeThreshold: 0.45,
    face: {
      present: true,
      eye: { eyeBlinkLeft: left, eyeBlinkRight: right },
      skipReason: null,
      durationMs: 20,
      delegate: "CPU",
    },
    ...overrides,
  });
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

  it("행동 버튼이 정해진 순서로 전부 있다 — 이름이 그대로 구간 이름이다", () => {
    setup();

    const labels = Array.from(document.querySelectorAll('[data-measure-action^="segment:"]')).map(
      (element) => element.textContent,
    );
    expect(labels).toEqual([...SEGMENT_BUTTONS]);
    expect(SEGMENT_BUTTONS).toContain("눈 감기");
    expect(SEGMENT_BUTTONS).toContain("꾸벅꾸벅");
  });

  it("버튼을 누르기 전에는 구간이 없다고 안내한다", () => {
    setup();

    expect(panelText()).toContain("구간 없음");
  });

  it("행동 버튼을 누르면 그 이름의 구간이 열리고 눌린 버튼만 표시된다", () => {
    const { measurement, advance, panel } = setup();

    button("segment:눈 감기")?.click();
    measurement.frame(frame());
    advance(8);
    panel.refresh();

    expect(panelText()).toContain("구간 눈 감기 8초");
    expect(button("segment:눈 감기")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("segment:눈 뜨기")?.getAttribute("aria-pressed")).toBeNull();
    const dump = JSON.parse(measurement.dump()) as { segments: { name: string }[] };
    expect(dump.segments.map((segment) => segment.name)).toEqual(["눈 감기"]);
  });

  it("눈 점수·다듬은 값·임계와 감김 여부를 보여준다 — 표본 둘이 모두 감겨야 감김이다", () => {
    const { measurement, panel } = setup();

    measurement.frame(eyeFrame(0.6, 0.7));
    panel.refresh();
    expect(panelText()).toContain("눈 L0.60 R0.70 → 0.60");
    expect(panelText()).toContain("판정 없음");

    measurement.frame(eyeFrame(0.62, 0.7));
    panel.refresh();
    expect(panelText()).toContain("다듬 0.60 · 임계 0.45 → 감김");

    measurement.frame(eyeFrame(0.1, 0.2));
    panel.refresh();
    expect(panelText()).toContain("→ 뜸");
  });

  it("비율 창이 차기 전에는 안 찼다고 말하고, 차면 비율과 원신호를 보여준다", () => {
    const { measurement, panel } = setup();

    measurement.frame(eyeFrame(0.6, 0.6, { eyeClosedRatio: null }));
    panel.refresh();
    expect(panelText()).toContain("비율 창 안 참");

    measurement.frame(
      eyeFrame(0.6, 0.6, { eyeClosedRatio: 0.64, sleepEyesSignal: true, sleepDrowsySignal: true }),
    );
    panel.refresh();
    expect(panelText()).toContain("비율 0.64 · 원신호 눈○ 꾸벅○");
  });

  it("상태와 그 상태에 머문 초를 보여준다", () => {
    const { measurement, advance, panel, now } = setup();

    measurement.transition("FOCUS", "DISTRACTION:SLEEP", now());
    advance(5);
    panel.refresh();

    expect(panelText()).toContain("상태 DISTRACTION:SLEEP 5초");
  });

  it("보정 전에는 판정을 쉰다고 말한다", () => {
    setup();

    expect(panelText()).toContain("보정중 (판정 쉼)");
  });

  it("보정되면 기준값·임계·창 수를 보여준다", () => {
    const { panel } = setup({ eyeCalibration: { windows: 2, baseline: 0.09, threshold: 0.45 } });

    panel.refresh();
    expect(panelText()).toContain("보정 기준 0.09 → 임계 0.45 · 창 2회");
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

    for (const action of ["copy", "segment:눈 감기", "thermal-start"]) {
      const element = button(action);
      expect(Number.parseInt(element?.style.minHeight ?? "0", 10)).toBeGreaterThanOrEqual(44);
      expect(Number.parseInt(element?.style.minWidth ?? "0", 10)).toBeGreaterThanOrEqual(44);
    }
  });

  it("자기 버튼 밖의 터치를 가로채지 않는다", () => {
    setup();
    const root = document.querySelector<HTMLElement>("[data-measure-panel]");

    expect(root?.style.pointerEvents).toBe("none");
    expect(button("copy")?.style.pointerEvents).toBe("auto");
    expect(button("segment:눈 감기")?.style.pointerEvents).toBe("auto");
  });

  it("세션 리플레이가 눈 점수를 녹화하지 못하게 차단 표식을 단다", () => {
    setup();

    const root = document.querySelector("[data-measure-panel]");
    expect(root?.classList.contains("amp-block")).toBe(true);
    expect(root?.classList.contains("sentry-block")).toBe(true);
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
