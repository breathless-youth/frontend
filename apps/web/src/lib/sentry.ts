import { useEffect } from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import * as Sentry from "@sentry/react";

import { sanitizePagePath, sanitizeUrl } from "./sanitizePath";

/**
 * `@sentry/react`는 `TransactionEvent`·`SpanJSON`을 재수출하지 않는다(`ErrorEvent`는 한다).
 * `@sentry/core`를 직접 의존에 추가하는 대신 **옵션 시그니처에서 끌어온다** — SDK가 실제로
 * 콜백에 넘기는 타입이므로 버전이 올라가도 자동으로 따라간다.
 */
type SentryOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;
export type TransactionEvent = Parameters<NonNullable<SentryOptions["beforeSendTransaction"]>>[0];
export type SpanJSON = Parameters<NonNullable<SentryOptions["beforeSendSpan"]>>[0];

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
    /**
     * **네 개를 모두 걸어야 한다.** `beforeSend`는 SDK 구현상 **에러 이벤트에서만** 호출되고
     * (`@sentry/core` `client.js`의 `isErrorEvent(...) && beforeSend` 분기), 트랜잭션·스팬은
     * `beforeSendTransaction`·`beforeSendSpan`으로만 가로챌 수 있다. 위 `tracesSampleRate`가
     * 켜져 있는 한 그 경로로도 URL이 나가므로 하나라도 빠지면 계약이 깨진다.
     */
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    beforeSendSpan: scrubSpan,
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
export function scrubEvent<E extends Sentry.ErrorEvent | TransactionEvent>(event: E): E {
  const request = event.request;
  if (request?.url !== undefined) {
    request.url = sanitizeUrl(request.url);
  }
  /**
   * `httpContextIntegration`이 `headers.Referer`에 `document.referrer`를 그대로 넣는다.
   * 브라우저 직접 접근·새로고침·전체 네비게이션에서는 여기에도 `?userId=N`이 남는다.
   */
  const referer: unknown = request?.headers?.Referer;
  if (typeof referer === "string" && request?.headers !== undefined) {
    request.headers.Referer = sanitizeUrl(referer);
  }
  // 라우팅 트레이스는 트랜잭션 이름에 경로를 넣는다(이미 라우트 패턴이면 멱등하게 통과한다).
  if (typeof event.transaction === "string") {
    const [pathname, search] = event.transaction.split("?");
    event.transaction = sanitizePagePath(pathname, search === undefined ? "" : `?${search}`);
  }
  return event;
}

/** 스팬 속성 중 URL 원본이 담기는 키들. 스팬 *이름*만 정제되고 속성은 그대로 남는다. */
const URL_SPAN_KEYS = ["url", "http.url", "url.full", "http.request.header.referer"];

/** 쿼리스트링만 따로 담는 키들. 통째로 버린다 — 화이트리스트 값은 정제된 URL에 이미 남는다. */
const QUERY_SPAN_KEYS = ["http.query", "url.query"];

/**
 * 스팬 속성의 URL을 정제한다.
 *
 * `getFetchSpanAttributes`(`@sentry/core`)가 `http.query`에 **원본 쿼리를 그대로** 넣는다.
 * `statsApi.ts`가 `/api/stats?userId=N&date=...`으로 호출하므로, 이게 없으면 홈·기록 탭을
 * 열 때마다 식별자가 스팬에 실린다 — 브레드크럼만 씻어서는 막히지 않는 경로다.
 */
export function scrubSpan(span: SpanJSON): SpanJSON {
  const data = span.data;
  if (data === undefined) return span;

  for (const key of URL_SPAN_KEYS) {
    const value: unknown = data[key];
    if (typeof value === "string") {
      data[key] = sanitizeUrl(value);
    }
  }
  for (const key of QUERY_SPAN_KEYS) {
    delete data[key];
  }
  return span;
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

/**
 * **처리된 실패를 Sentry에도 남긴다.** 이 앱의 catch들은 "앱을 죽이지 않는다"는 계약으로
 * 실패를 삼키는데(각 catch의 주석 참고), 그중 핵심 기능이 죽거나 저하되는 실패(비전 측정
 * 로드·카메라 획득·세션 제출)는 삼켜지는 순간 아무 데도 보이지 않게 된다 — 리텐션이 낮을 때 "측정
 * 품질 문제인지 제품 문제인지"를 가를 신호가 통째로 사라진다(BY-372).
 *
 * - `console.warn`을 헬퍼 안에서 유지한다 — 호출부의 기존 로그 관행이 사라지지 않는다.
 * - `warning` 레벨: unhandled(error)와 이슈 목록에서 구분된다. 슬랙 알림이 시끄러우면
 *   알림 규칙에 level 필터를 추가한다(코드 수정 아님 — Sentry 콘솔).
 * - DSN 미설정이면 `captureException`은 SDK 차원 no-op — 로컬·테스트·CI 무영향.
 * - 핵심 기능이 죽거나 저하되는 실패에 쓴다(GPU 실패 후 CPU 폴백 같은 기능 저하 포함 —
 *   기능이 저하된 기기군을 이슈 목록에서 식별하는 게 목적이다). 다음 실행에서 복구되는
 *   무해한 실패(온보딩 열람 기록, 업데이트 공지)에 쓰면 잡음이 신호를 덮는다.
 */
export function reportHandled(error: unknown, tag: string): void {
  console.warn(`[${tag}]`, error);
  Sentry.captureException(error, { level: "warning", tags: { handled_at: tag } });
}

/** React 렌더 에러를 Sentry로 보내는 createRoot 옵션 (React 19 에러 훅). */
export const sentryRootOptions = {
  onUncaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
};
