import { useEffect } from "react";

import type {
  AssetCacheReport,
  VisionReadyMeasurement,
} from "@/features/study-session/useVisionReadyTracking";

declare global {
  interface Window {
    /** 측정 빌드에서만 채운다. 측정 하네스(scripts/perf/measure-prefetch.mjs)가 읽는다. */
    __visionPerf?: VisionReadyMeasurement;
  }
}

/**
 * 측정 빌드(`VITE_PERF_PANEL=1`) 전용. 검출기 준비 시간과 wasm·모델 캐시 판정을 세션 화면에 띄운다.
 *
 * 웹뷰는 URL에 `?diag=1`을 붙이기 어려워 기존 진단 스위치 대신 빌드 플래그로 켠다. 호출부가
 * `import.meta.env.VITE_PERF_PANEL === "1" &&`로 감싸므로 운영 빌드에서는 조건이 false로 접히고 이
 * 모듈이 번들에서 빠진다. 절차는 docs/runbooks/vision-prefetch-measurement.md.
 */
export function VisionPerfPanel({ measurement }: { measurement: VisionReadyMeasurement | null }) {
  useEffect(() => {
    if (measurement !== null) {
      window.__visionPerf = measurement;
    }
  }, [measurement]);

  return (
    // role을 주지 않는다. DevVisionFailureNotice와 같은 이유로 세션 화면의 접근성 트리에 끼지 않게 한다.
    <dl
      data-perf-panel=""
      className="pointer-events-none absolute top-[calc(env(safe-area-inset-top)+28px)] left-2 z-50 grid grid-cols-[auto_auto] gap-x-2 rounded-md bg-black/75 px-2 py-1 font-mono text-[11px] leading-[15px] text-white"
    >
      <dt>사전로딩</dt>
      <dd>{import.meta.env.VITE_VISION_PREFETCH === "off" ? "off" : "on"}</dd>
      {measurement === null ? (
        <>
          <dt>검출기</dt>
          <dd>준비 전</dd>
        </>
      ) : (
        <>
          <dt>로딩→준비</dt>
          <dd>{measurement.loadMs} ms</dd>
          <dt>문서→준비</dt>
          <dd>{Math.round(measurement.readyAtMs)} ms</dd>
          <dt>wasm</dt>
          <dd>{describeAsset(measurement.wasm)}</dd>
          <dt>모델</dt>
          <dd>{describeAsset(measurement.model)}</dd>
        </>
      )}
    </dl>
  );
}

function describeAsset(asset: AssetCacheReport): string {
  const size =
    asset.transferSize === null
      ? "-"
      : `${Math.round(asset.transferSize / 1024).toLocaleString()} KB`;
  return `${asset.cache} · ${size}`;
}
