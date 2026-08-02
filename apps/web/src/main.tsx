import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { initSentry, sentryRootOptions } from "./lib/sentry";
import "./index.css";

initSentry();

createRoot(document.getElementById("root")!, sentryRootOptions).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
