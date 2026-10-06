import { useEffect, useState } from "react";
import type { RefObject } from "react";

import {
  createVisionFocusDetector,
  type PhotoTap,
  type VisionFocusDetector,
} from "@/features/study-session/adapters/focusDetector";
import {
  type AssetTiming,
  resolveModelVariant,
  type VisionRuntimeKind,
} from "@/features/study-session/vision/objectDetector";
import {
  DEFAULT_MODEL_VARIANT,
  MEDIAPIPE_WASM_PATH,
  MODEL_PATHS,
} from "@/features/study-session/vision/visionConfig";
import {
  trackVisionDetectorReady,
  trackVisionRuntimeFallback,
  type StudyRoomType,
} from "@/lib/amplitude";

/**
 * 자원을 이번에 네트워크로 다시 받았는가.
 * "body가 실제로 네트워크를 통한 근거가 있을 때만 miss"로 판정한다.
 *
 * - `unknown`: 항목이 없거나 전송량·인코딩 body·디코딩 body이 전부 0이라 판단할 정보가 없다
 *   (Timing-Allow-Origin 없는 크로스오리진 등).
 * - `miss`: 인코딩 body이 0보다 크고 전송량이 그 이상이다. body이 네트워크를 건넜다.
 * - `hit`: 그 밖의 모든 경우. 메모리·디스크 캐시, 304 재검증이 여기 속한다.
 *
 * `encodedBodySize`가 아니라 `transferSize`로 miss를 판정하는 이유:
 * WebKit은 304 재검증에서 `encodedBodySize`를 0으로 준다(Chromium은 캐시된 body 크기를 그대로 준다).
 * `encodedBodySize` 존재 여부로 캐시를 판정하면 iOS의 모든 캐시 적중이 `unknown`이 된다.
 * `transferSize`만 두 엔진에서 의미가 같다.
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
  /** 검출기가 도는 곳. 워커를 못 써 메인 스레드로 넘어간 비율을 운영에서 본다. */
  readonly runtime: VisionRuntimeKind;
  readonly wasm: AssetCacheReport;
  readonly model: AssetCacheReport;
}

export function classifyAssetCache(
  entry:
    | Pick<PerformanceResourceTiming, "transferSize" | "encodedBodySize" | "decodedBodySize">
    | undefined,
): AssetCacheState {
  if (
    entry === undefined ||
    (entry.transferSize === 0 && entry.encodedBodySize === 0 && entry.decodedBodySize === 0)
  ) {
    return "unknown";
  }
  return entry.encodedBodySize > 0 && entry.transferSize >= entry.encodedBodySize ? "miss" : "hit";
}

function report(entry: AssetTiming | undefined): AssetCacheReport {
  return { cache: classifyAssetCache(entry), transferSize: entry?.transferSize ?? null };
}

function lastEntry(
  entries: readonly AssetTiming[],
  sinceMs: number,
  matches: (pathname: string) => boolean,
): AssetTiming | undefined {
  // 같은 문서에서 홈이 먼저 받고 세션이 다시 요청했다면 뒤의 것이 세션의 요청이다.
  // sinceMs(이번 검출기의 로딩 시작 시각) 이전 항목은 배제한다 — Resource Timing 버퍼가
  // 가득 차 이번 요청이 기록되지 못하면, 배제하지 않을 경우 홈 프리페치나 같은 문서의
  // 이전 세션(소셜룸 탭 내 재입장)이 남긴 오래된 항목을 이번 요청으로 오판하게 된다.
  return entries
    .filter((entry) => entry.startTime >= sinceMs && matches(new URL(entry.name).pathname))
    .pop();
}

/**
 * wasm 바이너리와 모델의 Resource Timing 항목을 경로로 찾아 판정한다.
 * 워커가 받은 자원은 워커가 보내 준 `VisionFocusDetector.assetTimings`를 뒤에 붙여 넘긴다.
 * `sinceMs` 이전 항목(이전 문서·이전 세션의 요청)은 무시하고, 남는 항목이 없으면 `unknown`이다.
 *
 * `modelPath`는 기본값이 `DEFAULT_MODEL_VARIANT`다 — 실제 세션은 `resolveModelVariant`로 고른
 * 변형(DEV의 `?model=fp32` 등)의 경로를 넘겨야, 검출기가 실제로 받은 모델과 다른 경로를 찾다가
 * `unknown`으로 오판하지 않는다.
 */
export function readVisionAssetCache(
  entries: readonly AssetTiming[],
  sinceMs: number,
  modelPath: string = MODEL_PATHS[DEFAULT_MODEL_VARIANT],
): {
  wasm: AssetCacheReport;
  model: AssetCacheReport;
} {
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
 * 준비 뒤 워커에서 메인 스레드로 갈아타면 `vision_runtime_fallback`을 따로 한 번 보낸다.
 */
export function useVisionReadyTracking(
  detector: Pick<
    VisionFocusDetector,
    "subscribeStatus" | "subscribeRuntimeFallback" | "runtime" | "assetTimings"
  >,
  roomType: StudyRoomType,
): VisionReadyMeasurement | null {
  const [measurement, setMeasurement] = useState<VisionReadyMeasurement | null>(null);

  useEffect(() => {
    let fallbackSent = false;
    const unsubscribeFallback = detector.subscribeRuntimeFallback(() => {
      if (fallbackSent) {
        return;
      }
      fallbackSent = true;
      trackVisionRuntimeFallback({ roomType });
    });
    let loadingAt: number | null = null;
    let sent = false;
    const unsubscribeStatus = detector.subscribeStatus((status) => {
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
      const runtime = detector.runtime ?? "main";
      // 워커가 받은 wasm·모델은 문서의 Resource Timing에 없다.
      // 워커가 보내 준 항목을 뒤에 붙인다.
      const assets = readVisionAssetCache(
        [
          ...(performance.getEntriesByType("resource") as PerformanceResourceTiming[]),
          ...detector.assetTimings,
        ],
        loadingAt,
        MODEL_PATHS[resolveModelVariant(window.location.search)],
      );
      trackVisionDetectorReady({
        loadMs,
        roomType,
        runtime,
        wasmCache: assets.wasm.cache,
        modelCache: assets.model.cache,
      });
      setMeasurement({ loadMs, readyAtMs, runtime, ...assets });
    });
    return () => {
      unsubscribeStatus();
      unsubscribeFallback();
    };
  }, [detector, roomType]);

  return measurement;
}

/**
 * Vision 검출기를 만들면서 그 자리에서 바로 준비 추적을 건다.
 *
 * 생성과 동시에 상태 구독을 걸어야 하는 이유는 `useVisionReadyTracking`의 준비 시점 판정이
 * "구독 이후" 상태 변화만 보기 때문이다 — 구독은 현재 상태를 다시 알려 주지 않는다. 검출기를
 * 쓰는 훅(`useStudyRoomSession` 등)은 이 훅의 반환값(`visionDetector`)을 인자로 받으므로,
 * 검출기를 시작하는 모든 호출은 데이터 의존으로 이 훅 뒤에 오게 된다.
 */
export function useTrackedVisionDetector(
  videoRef: RefObject<HTMLVideoElement | null>,
  roomType: StudyRoomType,
  photoTap?: PhotoTap,
): { visionDetector: VisionFocusDetector; visionReady: VisionReadyMeasurement | null } {
  // 촬영 창구는 검출기와 수명이 같아 마운트 때 한 번만 읽는다.
  // eslint-disable-next-line react-hooks/refs -- video 게터는 추론 루프가 부른다. 생성 중에는 부르지 않는다
  const [visionDetector] = useState(() =>
    createVisionFocusDetector({ video: () => videoRef.current, photoTap }),
  );
  const visionReady = useVisionReadyTracking(visionDetector, roomType);
  return { visionDetector, visionReady };
}
