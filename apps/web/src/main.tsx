import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { AnalyticsRouteTracker } from "./components/AnalyticsRouteTracker";
import { initGA4 } from "./lib/analytics";
import { initAmplitude } from "./lib/amplitude";
import { initNativeTheme } from "./lib/nativeTheme";
import { initSentry, sentryRootOptions } from "./lib/sentry";
import "./index.css";

initSentry();
initGA4();
initAmplitude();
initNativeTheme();

createRoot(document.getElementById("root")!, sentryRootOptions).render(
  <StrictMode>
    <BrowserRouter>
      <AnalyticsRouteTracker />
      <App />
    </BrowserRouter>
  </StrictMode>,
);
