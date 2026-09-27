import { useEffect, useState } from "react";

import type { VisionFocusDetector } from "@/features/study-session/adapters/focusDetector";
import {
  DEFAULT_MODEL_VARIANT,
  MEDIAPIPE_WASM_PATH,
  MODEL_PATHS,
} from "@/features/study-session/vision/visionConfig";
import { trackVisionDetectorReady, type StudyRoomType } from "@/lib/amplitude";

/**
 * 자원을 이번에 네트워크로 다시 받았는가.
 *
 * - `hit` — 전송량이 본문보다 작다. 메모리·디스크 캐시(0 B)와 304 재검증(헤더만)이 여기 든다.
 * - `miss` — 본문을 다시 받았다.
 * - `unknown` — 항목이 없거나 본문 크기를 알 수 없다(지원하지 않는 엔진, 버퍼가 가득 참).
 */
export type AssetCacheState = "hit" | "miss" | "unknown";

export interface AssetCacheReport {
  readonly cache: AssetCacheState;
  /** 이번 요청이 네트워크로 옮긴 바이트(헤더 포함). 항목이 없으면 null. */
  readonly transferSize: number | null;
}

export interface VisionReadyMeasurement {
  /** 검출기 로딩 시작→준비, 정수 ms. */
  readonly loadMs: number;
  /** 준비된 시각(문서 시작 기준). 새 문서로 열린 솔로 세션에서만 "문서 로드→준비"로 읽힌다. */
  readonly readyAtMs: number;
  readonly wasm: AssetCacheReport;
  readonly model: AssetCacheReport;
}

export function classifyAssetCache(
  entry: Pick<PerformanceResourceTiming, "transferSize" | "encodedBodySize"> | undefined,
): AssetCacheState {
  if (entry === undefined || entry.encodedBodySize === 0) {
    return "unknown";
  }
  return entry.transferSize < entry.encodedBodySize ? "hit" : "miss";
}

function report(entry: PerformanceResourceTiming | undefined): AssetCacheReport {
  return { cache: classifyAssetCache(entry), transferSize: entry?.transferSize ?? null };
}

function lastEntry(
  entries: readonly PerformanceResourceTiming[],
  sinceMs: number,
  matches: (pathname: string) => boolean,
): PerformanceResourceTiming | undefined {
  // 같은 문서에서 홈이 먼저 받고 세션이 다시 요청했다면 뒤의 것이 세션의 요청이다.
  // sinceMs(이번 검출기의 로딩 시작 시각) 이전 항목은 배제한다 — Resource Timing 버퍼가
  // 가득 차 이번 요청이 기록되지 못하면, 배제하지 않을 경우 홈 프리페치나 같은 문서의
  // 이전 세션(소셜룸 탭 내 재입장)이 남긴 오래된 항목을 이번 요청으로 오판하게 된다.
  return entries
    .filter((entry) => entry.startTime >= sinceMs && matches(new URL(entry.name).pathname))
    .pop();
}

/**
 * wasm 바이너리와 기본 모델의 Resource Timing 항목을 경로로 찾아 판정한다.
 * `sinceMs` 이전 항목(이전 문서·이전 세션의 요청)은 무시하고, 남는 항목이 없으면 `unknown`이다.
 */
export function readVisionAssetCache(
  entries: readonly PerformanceResourceTiming[],
  sinceMs: number,
): {
  wasm: AssetCacheReport;
  model: AssetCacheReport;
} {
  const modelPath = MODEL_PATHS[DEFAULT_MODEL_VARIANT];
  return {
    wasm: report(
      lastEntry(
        entries,
        sinceMs,
        (pathname) => pathname.startsWith(`${MEDIAPIPE_WASM_PATH}/`) && pathname.endsWith(".wasm"),
      ),
    ),
    model: report(lastEntry(entries, sinceMs, (pathname) => pathname === modelPath)),
  };
}

/**
 * 세션 검출기가 로딩을 시작해 준비될 때까지의 시간과, 그때 wasm·모델을 캐시에서 받았는지를
 * `vision_detector_ready`로 한 번 보낸다. 같은 측정값을 반환값으로도 돌려준다.
 *
 * 구간을 "로딩 시작→준비"로 잡는 이유: 소셜룸은 탭 웹뷰 안의 라우팅으로 열려 문서 로드 기준이
 * 의미가 없고, 문서 로드 기준에는 카메라 첫 프레임 대기가 섞인다.
 * 준비 실패(`unavailable`)는 보내지 않는다. Sentry가 이미 받는다.
 */
export function useVisionReadyTracking(
  detector: Pick<VisionFocusDetector, "subscribeStatus">,
  roomType: StudyRoomType,
): VisionReadyMeasurement | null {
  const [measurement, setMeasurement] = useState<VisionReadyMeasurement | null>(null);

  useEffect(() => {
    let loadingAt: number | null = null;
    let sent = false;
    return detector.subscribeStatus((status) => {
      if (status === "loading") {
        loadingAt = performance.now();
        return;
      }
      if (status !== "ready" || loadingAt === null || sent) {
        return;
      }
      sent = true;
      const readyAtMs = performance.now();
      const loadMs = Math.round(readyAtMs - loadingAt);
      const assets = readVisionAssetCache(
        performance.getEntriesByType("resource") as PerformanceResourceTiming[],
        loadingAt,
      );
      trackVisionDetectorReady({
        loadMs,
        roomType,
        wasmCache: assets.wasm.cache,
        modelCache: assets.model.cache,
      });
      setMeasurement({ loadMs, readyAtMs, ...assets });
    });
  }, [detector, roomType]);

  return measurement;
}
