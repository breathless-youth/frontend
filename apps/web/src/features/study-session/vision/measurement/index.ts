import { PREVIEW_OBJECT_FIT } from "../../previewFit";
import { visionDiagnostics } from "../diagnostics";
import type { EyeOutline } from "../faceLandmarker";
import { createEyeOverlay } from "./eyeOverlay";
import type { EyeCalibration } from "../eyeCalibration";
import { FACE_LOST_ENABLED } from "../visionConfig";
import { measurementEnabled, measurementPanelEnabled, measurementRehearsal } from "./flags";
import type { Measurement } from "./measurement";
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

/**
 * 감지기가 자기 보정 결과를 읽는 길을 건네는 자리.
 *
 * 측정 도구는 이 모듈이 평가될 때 한 벌 만들어지고 감지기는 세션이 열릴 때 생긴다. 그래서
 * 감지기를 인자로 받을 수 없고, 나중에 도착하는 길을 여기 담아 둔다.
 */
let eyeCalibrationSource: (() => EyeCalibration | null) | null = null;

export function reportEyeCalibration(read: () => EyeCalibration | null): void {
  eyeCalibrationSource = read;
}

/**
 * 눈 자리 오버레이. 패널과 같은 조건(`?diag=1`)에서만 그린다. 기본 얼굴 래퍼가 이 함수를
 * `onEyeOutline`으로 받는다. 좌표는 캔버스에 그려지고 끝난다.
 */
const eyeOverlay = createEyeOverlay({ enabled: measurementPanelEnabled, fit: PREVIEW_OBJECT_FIT });

export function measurementEyeOutline(outline: EyeOutline | null): void {
  eyeOverlay.draw(outline);
}

declare global {
  interface Window {
    /** 진단이 켜져 있을 때만 존재한다. 측정하는 사람이 Safari 웹 인스펙터에서 쓴다. */
    __focusonMeasure?: Pick<Measurement, "mark" | "dump">;
  }
}

const tools = createMeasurementTools({
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
  eyeCalibration: () => eyeCalibrationSource?.() ?? null,
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
