import {
  setAppEnvironmentUserProperties,
  setCameraPermissionUserProperty,
  setThemeUserProperty,
  trackAppLaunched,
} from "./amplitude";
import { isNativeBridgeAvailable, subscribeToNativeMessages } from "./bridge";

/**
 * 네이티브→웹 브리지 메시지를 Amplitude 이벤트·user property로 옮긴다(BY-472) — 앱 실행
 * 신호와 환경(웹뷰 여부·앱 버전·테마·카메라 권한 상태)을 네이티브 SDK 없이 잡는 경로다.
 *
 * `main.tsx`가 `initNativeTheme()` **뒤에** 부른다 — 초기 테마 user property를
 * `data-theme`(셸 `?theme` 쿼리의 반영 결과)에서 읽기 때문이다. `initAmplitude()`보다도
 * 뒤여야 user property가 no-op으로 새지 않는다.
 *
 * 여기서 받는 메시지는 전부 **한 웹뷰에만 오거나 상태를 나타내는 것**이다. `app-launched`는
 * 셸이 홈 웹뷰에만 한 번 보내고, `camera-permission`·`theme`은 이벤트가 아니라 property로
 * 남긴다. 포/백그라운드 전환처럼 탭 웹뷰 수만큼 중복될 수 있는 사용자 이벤트는 여기 두지
 * 않는다 — 네이티브가 단일 sink 큐(`track-event`, BY-616)로 한 번만 넘긴다. 카메라 권한
 * **게이트의 분기 결과**도 같은 이유로 네이티브 몫이다(`camera_permission_gate_resolved`).
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
      case "camera-permission":
        // 설정(S6)이 물어본 현재 권한 상태 — 상태라 이벤트가 아니라 property다.
        setCameraPermissionUserProperty(message.granted);
        return;
      case "theme":
        setThemeUserProperty(message.scheme);
        return;
      default:
        return;
    }
  });
}
