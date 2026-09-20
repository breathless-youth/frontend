import { visionDiagnostics } from "../diagnostics";
import { FACE_LOST_ENABLED } from "../visionConfig";
import {
  measurementEnabled,
  measurementPanelEnabled,
  measurementRehearsal,
  REHEARSAL_DIVISOR,
} from "./flags";
import type { Measurement } from "./measurement";
import { MEASUREMENT_SCENARIOS, scaleScenarios } from "./scenarios";
import { createMeasurementTools } from "./wiring";

/**
 * 실기기 측정 도구의 진입점 — 이 폴더가 통째로 지울 단위다.
 * 되돌릴 목록은 `measurement.ts` 맨 위 docblock에 있다.
 *
 * 배선 자체는 `wiring.ts`에 있다. 여기서는 실제 시계·콘솔·URL 플래그를 넣어 한 벌 만들 뿐이다.
 */

export { stateLabel } from "./measurement";
export type { Measurement } from "./measurement";
export { measurementBaseline } from "./flags";

declare global {
  interface Window {
    /** 진단이 켜져 있을 때만 존재한다. 측정하는 사람이 Safari 웹 인스펙터에서 쓴다. */
    __focusonMeasure?: Pick<Measurement, "mark" | "dump">;
  }
}

const tools = createMeasurementTools({
  scenarios: measurementRehearsal
    ? scaleScenarios(MEASUREMENT_SCENARIOS, REHEARSAL_DIVISOR)
    : MEASUREMENT_SCENARIOS,
  now: () => Date.now(),
  log: (line) => {
    // 측정하는 사람이 이 줄을 보고 그 분의 thermal state와 CPU%를 Instruments에서 적는다.
    // 공유 `no-console` 규칙은 warn/error만 허용하지만 이건 경고가 아니라 측정 자료다.
    // eslint-disable-next-line no-console -- 위 사유(`diagnostics.ts`와 같은 판단)
    console.debug("[measure]", line);
  },
  base: visionDiagnostics,
  enabled: measurementEnabled,
  rehearsal: measurementRehearsal,
  panelEnabled: measurementPanelEnabled,
  faceLostEnabled: FACE_LOST_ENABLED,
});

/**
 * 모듈 하나짜리 인스턴스.
 *
 * 감지기를 여러 번 만들어도 같은 인스턴스를 써야 구간과 통계가 한곳에 모인다. 인스턴스가 갈리면
 * 콘솔에서 받은 덩어리가 세션의 일부만 담는다.
 */
export const measurementDiagnostics: Measurement = tools.measurement;

if (measurementEnabled && typeof window !== "undefined") {
  window.__focusonMeasure = {
    mark(name) {
      measurementDiagnostics.mark(name);
    },
    dump() {
      return measurementDiagnostics.dump();
    },
  };
}
