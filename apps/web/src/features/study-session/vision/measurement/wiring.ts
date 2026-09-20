import type { VisionDiagnostics } from "../diagnostics";
import type { EyeCalibration } from "../eyeCalibration";
import type { Measurement } from "./measurement";
import { createMeasurement } from "./measurement";
import type { MeasurementPanel } from "./panel";
import { mountMeasurementPanel } from "./panel";
import type { ThermalTimer } from "./runner";
import { createReportingThermalTimer } from "./runner";

/**
 * 측정 도구를 서로 잇는다.
 *
 * 한 팩토리에 모으는 이유는, 이음새가 끊긴 채로 지나간 일이 실제로 있었기 때문이다.
 * 모듈 최상위에 흩어 두면 테스트가 손댈 곳이 없어 끊겨도 아무도 모른다. 여기 있으면 가짜
 * 시계와 가짜 콘솔로 통로 전체를 한 번에 확인할 수 있다.
 */

export interface MeasurementToolsOptions {
  readonly now: () => number;
  readonly log: (line: string) => void;
  readonly base: VisionDiagnostics;
  readonly enabled: boolean;
  readonly panelEnabled: boolean;
  /** 감지기의 눈 보정 결과를 읽는 길. 감지기는 측정 도구보다 늦게 생기므로 함수로 받는다. */
  readonly eyeCalibration?: () => EyeCalibration | null;
}

export interface MeasurementTools {
  readonly measurement: Measurement;
  readonly thermal: ThermalTimer;
  /** 지금 붙어 있는 패널. 첫 프레임 전에는 null이다. */
  panel(): MeasurementPanel | null;
}

export function createMeasurementTools(options: MeasurementToolsOptions): MeasurementTools {
  const { now, log, base, enabled, panelEnabled, eyeCalibration } = options;

  let panel: MeasurementPanel | null = null;

  const measurement = createMeasurement(base, {
    enabled,
    eyeCalibration,
    now,
    onLine: log,
    onSessionSignal: () => {
      // 세션이 실제로 시작된 신호다. 여기서 패널을 붙인다 — 앱 부팅에서 붙이면 홈 화면을
      // 가린다.
      mount();
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
    panel = mountMeasurementPanel({
      measurement,
      thermal,
      enabled: panelEnabled,
    });
  }

  return {
    measurement,
    thermal,
    panel: () => panel,
  };
}
