import { DEFAULT_MODEL_VARIANT, MEDIAPIPE_WASM_PATH, MODEL_PATHS } from "./visionConfig";

/**
 * 세션 검출기가 쓸 MediaPipe 자원(로더 JS·wasm·기본 모델)을 홈 유휴 시간에 미리 받아 HTTP 캐시에 남긴다.
 *
 * 세션은 지금 코드 그대로 같은 URL을 요청하고, 캐시가 데워져 있으면 본문 전송 없이(디스크 캐시·304)
 * 끝난다. 탭 웹뷰와 세션 웹뷰는 같은 HTTP 캐시를 쓴다. 세 요청 모두 같은 출처라 기본 `fetch`와
 * 세션의 요청(wasm은 `credentials: "same-origin"` fetch, 모델은 기본 fetch, 로더는
 * `crossOrigin="anonymous"` 스크립트)이 캐시 항목을 나눠 쓴다.
 *
 * - 문서당 한 번만 한다.
 * - Save-Data를 켠 사용자와 측정용 전 빌드(`VITE_VISION_PREFETCH=off`)는 받지 않는다.
 * - `requestIdleCallback`이 없는 엔진(iOS WKWebView)은 1.5초 뒤로 미룬다.
 * - 세 파일을 순서대로 받는다. 느린 망에서 wasm부터 완성되고 홈의 뒤이은 요청과 덜 겹친다.
 * - 본문을 끝까지 읽는다. 그래야 캐시에 온전히 남는다.
 *
 * `<link rel="prefetch">`를 쓰지 않는 이유: iOS WebKit이 지원하지 않고, SIMD 여부에 따른 파일 이름을
 * JS 없이 고를 수 없다.
 */

/** `requestIdleCallback`이 없을 때 미루는 시간. 통계 표시 직후의 첫 입력을 방해하지 않을 여유다. */
const IDLE_FALLBACK_MS = 1_500;

let requested = false;

export function prefetchVisionAssets(): void {
  if (requested) {
    return;
  }
  requested = true;
  if (import.meta.env.VITE_VISION_PREFETCH === "off") {
    return;
  }
  // Network Information API는 표준 DOM 타입에 없고, 지원하지 않는 엔진에서는 undefined다.
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData === true) {
    return;
  }
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => void fetchVisionAssets());
  } else {
    setTimeout(() => void fetchVisionAssets(), IDLE_FALLBACK_MS);
  }
}

async function fetchVisionAssets(): Promise<void> {
  try {
    // 세션이 쓰는 것과 같은 청크다. 여기서 받아 두면 세션은 청크도 캐시에서 연다.
    const { resolveVisionAssetUrls } = await import("./mediapipeModule");
    const { wasmLoaderPath, wasmBinaryPath } = await resolveVisionAssetUrls(MEDIAPIPE_WASM_PATH);
    for (const url of [wasmLoaderPath, wasmBinaryPath, MODEL_PATHS[DEFAULT_MODEL_VARIANT]]) {
      const response = await fetch(url, { priority: "low" });
      if (!response.ok) {
        // 실패 응답이다. 나머지 파일도 받지 않고 멈춘다.
        return;
      }
      await response.arrayBuffer();
    }
  } catch {
    // 미리 받기는 최적화일 뿐이다. 실패해도 세션이 직접 받는다.
  }
}
