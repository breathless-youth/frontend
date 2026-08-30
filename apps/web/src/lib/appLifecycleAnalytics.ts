import {
  setAppEnvironmentUserProperties,
  setThemeUserProperty,
  trackAppBackgrounded,
  trackAppForegrounded,
  trackAppLaunched,
  trackCameraPermissionResult,
} from "./amplitude";
import { isNativeBridgeAvailable, subscribeToNativeMessages } from "./bridge";

/**
 * 네이티브→웹 브리지 메시지를 Amplitude 이벤트로 옮긴다(BY-472) — 네이티브 Amplitude SDK
 * 없이 앱 수명 신호(실행·포/백그라운드·카메라 권한)를 잡는 유일한 경로다.
 *
 * `main.tsx`가 `initNativeTheme()` **뒤에** 부른다 — 초기 테마 user property를
 * `data-theme`(셸 `?theme` 쿼리의 반영 결과)에서 읽기 때문이다. `initAmplitude()`보다도
 * 뒤여야 user property가 no-op으로 새지 않는다.
 *
 * ⚠️ 브리지 메시지는 **이 웹뷰가 마운트되어 구독 중인 동안만** 도달한다. 셸은 탭마다
 * 웹뷰를 따로 띄우므로 브로드캐스트성 메시지(`app-state` 등)는 떠 있는 웹뷰 수만큼
 * 중복 이벤트가 될 수 있다 — 웹 쪽에서는 서로를 몰라 중복 제거가 불가능하니 차트에서
 * 감안하고, 실기기에서 수신 시점·중복 정도를 확인해 필요하면 네이티브가 한 웹뷰에만
 * 보내도록 조정한다(BY-472 구현 시 확인 항목).
 */
export function initAppLifecycleAnalytics(): void {
  const datasetTheme = document.documentElement.dataset.theme;
  // Android는 셸이 `data-theme`으로 굳혀 두고(initNativeTheme), iOS·브라우저 단독은
  // 미디어쿼리가 안다(jsdom에는 matchMedia가 없어 존재 검사가 필요하다).
  const prefersDark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  setAppEnvironmentUserProperties({
    isWebview: isNativeBridgeAvailable(),
    appVersion: new URLSearchParams(window.location.search).get("appVersion"),
    theme: datasetTheme === "dark" || (datasetTheme !== "light" && prefersDark) ? "dark" : "light",
  });

  subscribeToNativeMessages((message) => {
    switch (message.type) {
      case "app-launched":
        trackAppLaunched();
        return;
      case "app-state":
        if (message.state === "active") {
          trackAppForegrounded();
        } else {
          trackAppBackgrounded();
        }
        return;
      case "camera-permission":
        trackCameraPermissionResult(message.granted, "session");
        return;
      case "camera-gate-result":
        trackCameraPermissionResult(message.granted, "gate");
        return;
      case "theme":
        setThemeUserProperty(message.scheme);
        return;
      default:
        return;
    }
  });
}
