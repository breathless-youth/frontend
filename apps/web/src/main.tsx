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
initNativeTheme();
// initAmplitude(user property no-op 방지)·initNativeTheme(초기 테마 확정) 뒤여야 한다.
initAppLifecycleAnalytics();

createRoot(document.getElementById("root")!, sentryRootOptions).render(
  <StrictMode>
    <BrowserRouter>
      <AnalyticsRouteTracker />
      <App />
    </BrowserRouter>
  </StrictMode>,
);
