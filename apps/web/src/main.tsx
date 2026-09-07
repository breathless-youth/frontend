import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { AnalyticsRouteTracker } from "./components/AnalyticsRouteTracker";
import { initGA4 } from "./lib/analytics";
import { initAmplitude } from "./lib/amplitude";
import { initAppLifecycleAnalytics } from "./lib/appLifecycleAnalytics";
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

createRoot(document.getElementById("root")!, sentryRootOptions).render(
  <StrictMode>
    <BrowserRouter>
      <AnalyticsRouteTracker />
      <App />
    </BrowserRouter>
  </StrictMode>,
);
