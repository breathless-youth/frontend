import type { VisionDiagnostics } from "../diagnostics";
import type { EyeCalibration } from "../eyeCalibration";
import { rehearsalBaseline } from "./flags";
import type { Measurement } from "./measurement";
import { createMeasurement } from "./measurement";
import type { MeasurementPanel } from "./panel";
import { mountMeasurementPanel } from "./panel";
import type { ScenarioRunner, ThermalTimer } from "./runner";
import { createReportingThermalTimer, createScenarioRunner } from "./runner";
import type { MeasurementScenario } from "./scenarios";
import { totalScenarioSec } from "./scenarios";

/**
 * 측정 도구를 서로 잇는다.
 *
 * 배선을 팩토리 하나에 모으는 이유는, 배선이 끊긴 채로 지나간 일이 실제로 있었기 때문이다.
 * 모듈 최상위에 흩어 두면 테스트가 손댈 곳이 없어 끊겨도 아무도 모른다. 여기 있으면 가짜
 * 시계와 가짜 콘솔로 통로 전체를 한 번에 확인할 수 있다.
 */

export interface MeasurementToolsOptions {
  readonly scenarios: readonly MeasurementScenario[];
  readonly now: () => number;
  readonly log: (line: string) => void;
  readonly base: VisionDiagnostics;
  readonly enabled: boolean;
  readonly rehearsal: boolean;
  readonly panelEnabled: boolean;
  readonly faceLostEnabled: boolean;
  /** 감지기의 눈 보정 결과를 읽는 길. 감지기는 측정 도구보다 늦게 생기므로 함수로 받는다. */
  readonly eyeCalibration?: () => EyeCalibration | null;
}

export interface MeasurementTools {
  readonly measurement: Measurement;
  readonly runner: ScenarioRunner;
  readonly thermal: ThermalTimer;
  /** 지금 붙어 있는 패널. 첫 프레임 전에는 null이다. */
  panel(): MeasurementPanel | null;
}

export function createMeasurementTools(options: MeasurementToolsOptions): MeasurementTools {
  const {
    scenarios,
    now,
    log,
    base,
    enabled,
    rehearsal,
    panelEnabled,
    faceLostEnabled,
    eyeCalibration,
  } = options;

  let panel: MeasurementPanel | null = null;

  const measurement = createMeasurement(base, {
    enabled,
    rehearsal,
    // 어댑터가 받는 것과 같은 값을 싣는다. 스냅샷과 실제가 어긋나면 스냅샷이 쓸모없다.
    baseline: rehearsalBaseline(rehearsal),
    faceLostEnabled,
    eyeCalibration,
    now,
    onLine: log,
    onSessionSignal: () => {
      // 세션이 실제로 시작된 신호다. 여기서 패널을 붙이고 진행 시계를 연다 — 앱 부팅에서
      // 시작하면 홈에 머무는 동안 첫 시나리오가 지나가 버린다.
      mount();
    },
  });

  const runner = createScenarioRunner({
    scenarios,
    now,
    onSegment: (name, scenario) => {
      measurement.mark(name, scenario);
    },
  });

  const thermal = createReportingThermalTimer({
    now,
    stats: () => measurement.stats(),
    log,
    onSummary: (state) => {
      measurement.setThermal(state);
    },
  });

  function mount(): void {
    if (panel !== null) {
      return;
    }
    runner.start();
    panel = mountMeasurementPanel({
      measurement,
      runner,
      thermal,
      rehearsal,
      oneRoundSec: totalScenarioSec(scenarios),
      enabled: panelEnabled,
      faceLostEnabled,
    });
  }

  return {
    measurement,
    runner,
    thermal,
    panel: () => panel,
  };
}
