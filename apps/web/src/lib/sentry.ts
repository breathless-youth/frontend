import { useEffect } from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import * as Sentry from "@sentry/react";

import { sanitizePagePath, sanitizeUrl } from "./analytics";

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
    /**
     * `import.meta.env.MODE`는 `vite build`면 Preview든 Production이든 항상 `"production"`이라
     * 두 배포를 구분하지 못한다. Vercel 시스템 변수 `VERCEL_ENV`를 빌드 타임에 주입해
     * (`vite.config.ts`의 `define`) `production`·`preview`·`development`를 나눈다 — PR마다 뜨는
     * Preview 배포의 에러가 실사용자 에러와 한 통에 섞이면 게이트 판단이 불가능해진다.
     */
    environment: __DEPLOY_ENV__,
    /** 배포 커밋 SHA(7자리). 어느 배포에서 난 에러인지 묶는 기준이자 소스맵 대조 키. */
    release: __RELEASE__,
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
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}

/**
 * 이벤트에 실려 나가는 URL·트랜잭션 이름에서 사용자 식별자를 지운다.
 *
 * **`sendDefaultPii: false`로는 막을 수 없다** — 그 옵션은 쿠키·IP·헤더를 뺄 뿐
 * 쿼리스트링은 건드리지 않는다. 웹뷰는 모든 탭을 `?userId=N`으로 열기 때문에(네이티브 셸
 * 계약) 그대로 두면 익명 기기 계정 ID가 Sentry로 나간다. GA4에 같은 이유로 씌운 화이트리스트
 * (`sanitizePagePath`)를 그대로 재사용한다 — 규칙이 갈리면 한쪽만 고치는 사고가 난다.
 */
export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request?.url !== undefined) {
    event.request.url = sanitizeUrl(event.request.url);
  }
  // 라우팅 트레이스는 트랜잭션 이름에 경로를 그대로 넣는다.
  if (typeof event.transaction === "string") {
    const [pathname, search] = event.transaction.split("?");
    event.transaction = sanitizePagePath(pathname, search === undefined ? "" : `?${search}`);
  }
  return event;
}

/**
 * 네비게이션 브레드크럼의 `from`/`to`/`url`도 원본 경로다. 에러 직전 화면 이동 이력은
 * 진단에 필요하므로 버리지 않고 식별자만 씻어서 남긴다.
 */
export function scrubBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb {
  const data = breadcrumb.data;
  if (data === undefined) return breadcrumb;

  for (const key of ["from", "to", "url"]) {
    const value: unknown = data[key];
    if (typeof value === "string") {
      data[key] = sanitizeUrl(value);
    }
  }
  return breadcrumb;
}

/** React 렌더 에러를 Sentry로 보내는 createRoot 옵션 (React 19 에러 훅). */
export const sentryRootOptions = {
  onUncaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
};
