import type { Delegate, ModelVariant } from "./visionConfig";

/**
 * Vision 진단 로그 — **개발 빌드 전용**(설계 §8).
 *
 * mvp-scope가 프레임 주기·감지 유지시간·score 임계를 모두 "M1에서 튜닝"으로 미뤄뒀는데,
 * 튜닝하려면 판정 근거가 남아 있어야 한다. 그 장치가 이 모듈이다.
 *
 * ⚠️ **좌표는 절대 남기지 않는다.** `frontend/CLAUDE.md`가 "카메라 원본 프레임·얼굴 이미지·
 * 랜드마크 좌표는 … 로그 기록 금지"로 못박았고, 설계 §8이 **검출 박스 좌표도 같은 금지에
 * 걸린다**고 해석했다 — 좌표는 랜드마크와 같은 성격의 위치 정보다.
 *
 * 금지를 주석이 아니라 **타입으로** 건다. `FrameDiagnostics`에 bbox를 넣을 자리가 없고,
 * `DiagnosticsSink`의 payload는 **스칼라만** 받는다(중첩 객체가 안 되므로 박스가 딸려 들어갈
 * 경로 자체가 없다). 남기는 것은 설계 §8 표 그대로다 —
 * person 유무 · 라벨별 최고 score · 최종 판정 · 프레임 소요시간 · 선택된 delegate · 상태 전이 시각.
 */

/** 중첩 객체를 받지 않는다 — 이 제약이 bbox 유출을 구조적으로 막는다. */
export type DiagnosticsPayload = Readonly<Record<string, string | number | boolean>>;

export interface DiagnosticsSink {
  log(event: string, payload: DiagnosticsPayload): void;
}

export interface FrameDiagnostics {
  /** person 유무 (boolean) — 몇 명인지, 어디 있는지는 남기지 않는다. */
  readonly personPresent: boolean;
  /** 라벨 → 최고 score. `detectionRules.topScoresByLabel()`이 만든다. */
  readonly topScores: Readonly<Record<string, number>>;
  /** 최종 판정(원신호). 유지시간 디바운스 이전 값이다. */
  readonly awaySignal: boolean;
  readonly phoneSignal: boolean;
  /** 프레임 처리 소요시간(ms). */
  readonly durationMs: number;
  readonly delegate: Delegate | null;
}

export interface VisionDiagnostics {
  detectorReady(delegate: Delegate, modelVariant: ModelVariant): void;
  detectorUnavailable(reason: string): void;
  frame(diagnostics: FrameDiagnostics): void;
  /** 상태 전이 시각. 임계를 바꿨을 때 오탐이 얼마나 주는지 계산하는 근거가 된다. */
  transition(from: string, to: string, atMs: number): void;
}

/** 소수점 둘째 자리까지. 로그가 `0.8123000000000001`로 뒤덮이면 읽을 수 없다. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function createVisionDiagnostics(sink: DiagnosticsSink): VisionDiagnostics {
  return {
    detectorReady(delegate, modelVariant) {
      sink.log("detector:ready", { delegate, modelVariant });
    },
    detectorUnavailable(reason) {
      sink.log("detector:unavailable", { reason });
    },
    frame(diagnostics) {
      const payload: Record<string, string | number | boolean> = {
        personPresent: diagnostics.personPresent,
        away: diagnostics.awaySignal,
        phone: diagnostics.phoneSignal,
        durationMs: round2(diagnostics.durationMs),
        delegate: diagnostics.delegate ?? "none",
      };
      for (const [label, score] of Object.entries(diagnostics.topScores)) {
        payload[`score:${label}`] = round2(score);
      }
      sink.log("vision:frame", payload);
    },
    transition(from, to, atMs) {
      sink.log("vision:transition", { from, to, atMs });
    },
  };
}

const consoleSink: DiagnosticsSink = {
  log(event, payload) {
    // 공유 `no-console` 규칙은 warn/error만 허용하지만, 진단 로그는 경고가 아니라 튜닝 자료다.
    // warn으로 올리면 실제 경고가 진단 로그에 파묻히고, 프레임마다 나오므로 콘솔이 붉어진다.
    // `console.debug`는 브라우저 기본 필터에서 접혀 있어 필요할 때만 Verbose로 펼치면 된다.
    // 이 파일은 DEV 빌드에서만 살아남으므로(아래 `visionDiagnostics`) 프로덕션에는 남지 않는다.
    // eslint-disable-next-line no-console -- 위 사유
    console.debug(`[${event}]`, payload);
  },
};

const noopDiagnostics: VisionDiagnostics = {
  detectorReady() {},
  detectorUnavailable() {},
  frame() {},
  transition() {},
};

/**
 * 기본 인스턴스.
 *
 * Vite가 프로덕션 빌드에서 `import.meta.env.DEV`를 리터럴 `false`로 치환하므로 이 삼항식이
 * 통째로 접히고, `createVisionDiagnostics`·`consoleSink`는 **아무 데서도 참조되지 않아 번들에서
 * 빠진다.** 함수 안에서 `if (!DEV) return;`으로 막는 방식은 호출부가 남아 코드가 따라 들어오는데,
 * 이쪽은 트리셰이킹이 실제로 걷어낸다 — 프로덕션 바이너리에 코드가 없으면 프라이버시 리스크가 0이다.
 */
export const visionDiagnostics: VisionDiagnostics = import.meta.env.DEV
  ? createVisionDiagnostics(consoleSink)
  : noopDiagnostics;
