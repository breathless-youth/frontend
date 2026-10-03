import { useEffect, useState } from "react";

import type {
  AssetCacheReport,
  VisionReadyMeasurement,
} from "@/features/study-session/useVisionReadyTracking";
import {
  mainThreadRecorder,
  type MainThreadSummary,
} from "@/features/study-session/vision/mainThreadMetrics";

export type VisionPerfSnapshot = VisionReadyMeasurement & {
  readonly mainThread: MainThreadSummary;
};

declare global {
  interface Window {
    /** 측정 빌드에서만 채우고 1초마다 갱신한다. 측정 하네스 `scripts/perf/measure-*.mjs`가 읽는다. */
    __visionPerf?: VisionPerfSnapshot;
  }
}

/** 패널 숫자를 다시 계산하는 간격. 사람이 읽는 값이라 1초면 충분하다. */
const SUMMARY_INTERVAL_MS = 1_000;

/**
 * 측정 빌드(`VITE_PERF_PANEL=1`) 전용.
 *
 * 검출기 준비 시간과 wasm·모델 캐시 판정, 메인 스레드 막힘 지표 ①②③을 세션 화면에 띄운다.
 * 막힘 지표의 정의는 `../vision/mainThreadMetrics.ts`에 있다.
 * 웹뷰는 URL에 `?diag=1`을 붙이기 어려워 기존 진단 스위치 대신 빌드 플래그로 켠다.
 * 호출부가 `import.meta.env.VITE_PERF_PANEL === "1" &&`로 감싸므로 운영 빌드에서는 조건이 false로 접히고 이 모듈이 번들에서 빠진다.
 * 절차는 docs/runbooks/vision-prefetch-measurement.md, docs/runbooks/vision-worker-measurement.md.
 */
export function VisionPerfPanel({ measurement }: { measurement: VisionReadyMeasurement | null }) {
  const [mainThread, setMainThread] = useState<MainThreadSummary | null>(null);
  const readyAtMs = measurement?.readyAtMs ?? null;

  useEffect(() => {
    // 첫 마운트에서 기록을 시작한다. 준비 시각이 바뀌어도 기록은 이어지고 집계만 다시 한다.
    const recorder = mainThreadRecorder();
    const timer = setInterval(() => {
      setMainThread(recorder.summarize(readyAtMs));
    }, SUMMARY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [readyAtMs]);

  useEffect(() => {
    if (measurement !== null && mainThread !== null) {
      window.__visionPerf = { ...measurement, mainThread };
    }
  }, [measurement, mainThread]);

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
          <dt>런타임</dt>
          <dd>{measurement.runtime}</dd>
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
      {mainThread !== null && (
        <>
          <dt>① 시작 최장 멈춤</dt>
          <dd>{mainThread.startupMaxGapMs} ms</dd>
          <dt>② Long Task</dt>
          <dd>
            {mainThread.longTaskExcessMs === null
              ? "-"
              : `${mainThread.longTaskExcessMs} ms / ${mainThread.longTaskCount}건`}
          </dd>
          <dt>③ 50ms 넘는 간격</dt>
          <dd>{mainThread.frameGapsOver50}회</dd>
          <dt>안정 구간</dt>
          <dd>{mainThread.complete ? "완료" : "측정 중"}</dd>
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
