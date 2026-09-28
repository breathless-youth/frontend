import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { AnalyticsRouteTracker } from "./components/AnalyticsRouteTracker";
import { initGA4 } from "./lib/analytics";
import { initAmplitude } from "./lib/amplitude";
import { initAppLifecycleAnalytics } from "./lib/appLifecycleAnalytics";
import { initBridgeTokenSource } from "./lib/auth/tokenSource";
import { installFakeCamera } from "./lib/fakeCamera";
import { initNativeTheme } from "./lib/nativeTheme";
import { initSentry, sentryRootOptions } from "./lib/sentry";
import "./index.css";

initSentry();
initGA4();
initAmplitude();
// initAmplitude(user property no-op 방지) 뒤여야 한다. 초기 테마는 index.html 인라인
// 스크립트가 첫 페인트 전에 data-theme에 이미 반영해 둔다.
initNativeTheme();
initAppLifecycleAnalytics();
// 라우트의 첫 react-query 요청이 App effect보다 먼저 돌므로 createRoot 전에 구독·auth-ready를 건다.
initBridgeTokenSource();
// 측정 빌드 전용 가짜 카메라 — 운영 빌드에서는 조건이 접혀 빠진다.
if (import.meta.env.VITE_FAKE_CAMERA === "1") {
  installFakeCamera();
}

createRoot(document.getElementById("root")!, sentryRootOptions).render(
  <StrictMode>
    <BrowserRouter>
      <AnalyticsRouteTracker />
      <App />
    </BrowserRouter>
  </StrictMode>,
);
