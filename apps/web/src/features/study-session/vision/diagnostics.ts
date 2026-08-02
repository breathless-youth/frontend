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

/**
 * 실제로 열린 카메라 트랙의 설정.
 *
 * `visionConfig.CAMERA_CONSTRAINTS`가 `ideal`(소프트 제약)이라 **요청한 720×1280이 그대로
 * 온다는 보장이 없다** — 9:16은 센서의 네이티브 비율이 아니라서 4:3으로 돌아오는 경우가 흔하고,
 * 기기에 따라 가로로 오기도 한다. 그런데 지금까지 코드 어디에서도 이 값을 읽지 않아, 프리뷰가
 * 어떻게 보이는지를 설명할 근거가 없었다(2026-07-29 크롭 조사).
 *
 * 프리뷰가 `object-contain`이므로 이 비율이 곧 **여백 크기**다. 화면이 이상해 보일 때 먼저 볼 값.
 *
 * 해상도·비율·방향은 화상이 아니므로 `frontend/CLAUDE.md`의 로그 금지 대상(원본 프레임·얼굴
 * 이미지·랜드마크 좌표)에 걸리지 않는다.
 */
export interface CameraStreamDiagnostics {
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: number;
  readonly facingMode: string;
}

export interface VisionDiagnostics {
  detectorReady(delegate: Delegate, modelVariant: ModelVariant): void;
  detectorUnavailable(reason: string): void;
  frame(diagnostics: FrameDiagnostics): void;
  /** 상태 전이 시각. 임계를 바꿨을 때 오탐이 얼마나 주는지 계산하는 근거가 된다. */
  transition(from: string, to: string, atMs: number): void;
  /** 카메라를 열 때마다 한 번. 전환(`flip`)도 새로 여는 것이므로 각각 남는다. */
  cameraStream(diagnostics: CameraStreamDiagnostics): void;
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
    cameraStream(diagnostics) {
      sink.log("camera:stream", {
        width: diagnostics.width,
        height: diagnostics.height,
        aspectRatio: round2(diagnostics.aspectRatio),
        facingMode: diagnostics.facingMode,
        // 세로/가로는 눈으로 즉시 판단할 값이라 계산해서 남긴다 — 여백이 상하로 생길지
        // 좌우로 생길지가 여기서 갈린다.
        orientation: diagnostics.width <= diagnostics.height ? "portrait" : "landscape",
      });
    },
  };
}

const consoleSink: DiagnosticsSink = {
  log(event, payload) {
    // 공유 `no-console` 규칙은 warn/error만 허용하지만, 진단 로그는 경고가 아니라 튜닝 자료다.
    // warn으로 올리면 실제 경고가 진단 로그에 파묻히고, 프레임마다 나오므로 콘솔이 붉어진다.
    // `console.debug`는 브라우저 기본 필터에서 접혀 있어 필요할 때만 Verbose로 펼치면 된다.
    // eslint-disable-next-line no-console -- 위 사유
    console.debug(`[${event}]`, payload);
  },
};

const noopDiagnostics: VisionDiagnostics = {
  detectorReady() {},
  detectorUnavailable() {},
  frame() {},
  transition() {},
  cameraStream() {},
};

/** 진단을 켜는 URL 질의 파라미터. `?diag=1`. */
export const DIAGNOSTICS_QUERY_KEY = "diag";

/**
 * 진단을 켤지 판정한다.
 *
 * DEV는 항상 켠다. 프로덕션 번들에서는 **`?diag=1`이 붙었을 때만** 켠다 —
 * 앱에 동봉되는 `web-dist`는 언제나 프로덕션 빌드라, 이 플래그가 없으면 실기기에서
 * 진단을 볼 방법이 아예 없다(2026-07-30에 실제로 그랬다: 번들에 `camera:stream` 문자열이
 * 0건이었다). 플래그는 `apps/mobile`의 `buildSessionUrl`이 Dev Client 빌드에서만 붙인다.
 *
 * ⚠️ **이 판정은 런타임이라 트리셰이킹을 포기한다.** 이전에는 `import.meta.env.DEV`
 * 삼항식이 프로덕션에서 통째로 접혀 `createVisionDiagnostics`·`consoleSink`가 번들에서
 * 빠졌고, 그 근거가 "프로덕션 바이너리에 코드가 없으면 프라이버시 리스크가 0"이었다.
 * 이제 코드는 남는다.
 *
 * 그럼에도 프라이버시 계약은 유지된다. 그 근거는 코드의 부재가 아니라 **타입**이기 때문이다 —
 * `DiagnosticsPayload`가 스칼라만 받아 중첩 객체가 들어갈 자리가 없고, 그래서 bbox·좌표가
 * 실릴 경로 자체가 존재하지 않는다. 기본값도 꺼짐이라 플래그 없이는 아무것도 기록되지 않는다.
 */
export function isDiagnosticsEnabled(search: string, dev: boolean): boolean {
  if (dev) {
    return true;
  }
  try {
    return new URLSearchParams(search).get(DIAGNOSTICS_QUERY_KEY) === "1";
  } catch {
    // 손상된 질의 문자열 때문에 세션이 죽으면 안 된다 — 진단은 부가 기능이다.
    return false;
  }
}

/** 기본 인스턴스. 모듈 로드 시 한 번 판정한다 — 세션 도중 플래그가 바뀌지 않는다. */
export const visionDiagnostics: VisionDiagnostics = isDiagnosticsEnabled(
  globalThis.location?.search ?? "",
  import.meta.env.DEV,
)
  ? createVisionDiagnostics(consoleSink)
  : noopDiagnostics;
