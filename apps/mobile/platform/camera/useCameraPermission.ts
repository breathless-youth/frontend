import { useState } from "react";

/**
 * 카메라 권한 어댑터 — 현재는 mock(항상 허용)이다. `platform/vision`, `platform/rtc`와
 * 동일하게 네이티브 전환 시 실제 권한 API로 교체한다.
 * 배경: docs/adr/0003-phased-rollout-webview-mvp-then-native.md
 */
export function useCameraPermission() {
  const [granted] = useState(true);
  return {
    granted,
    canAskAgain: true,
    requestPermission: async () => ({ granted: true }),
  };
}
