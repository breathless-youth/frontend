import { useEffect } from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import * as Sentry from "@sentry/react";

/**
 * Sentry 초기화. `VITE_SENTRY_DSN`이 없으면 아무것도 하지 않는다 —
 * 로컬 개발·테스트는 DSN 없이 그대로 돌아간다.
 *
 * Session Replay는 쓰지 않는다: 카메라 프리뷰가 뜨는 세션 화면을 녹화 수집하는 것은
 * "원본 프레임·얼굴 데이터를 서버로 보내지 않는다"는 개인정보 원칙과 충돌한다.
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.reactRouterV7BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    // 성능 트레이스는 표본만 수집한다 — 에러는 샘플링과 무관하게 전부 잡힌다.
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
  });
}

/** React 렌더 에러를 Sentry로 보내는 createRoot 옵션 (React 19 에러 훅). */
export const sentryRootOptions = {
  onUncaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
};
