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
 * Session Replay는 카메라 차단 조건으로만 켠다.
 * 모든 미디어를 차단해 카메라 프리뷰는 단말 밖으로 나가지 않고, 화면 텍스트는 남긴다.
 * 앱 셸은 여전히 금지다. 전 화면이 WebView라 리플레이가 통째로 마스킹되어 실익이 없다.
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
      /**
       * Session Replay
       *
       * - `blockAllMedia: true`는 기본값이지만 계약이라 명시한다.
       * - `maskAllText: false`는 타이머·집중률 등 화면 텍스트를 남긴다. Amplitude 리플레이에서
       *   이미 허용된 범위와 동일하다. 입력 필드 마스킹은 기본값을 유지한다.
       */
      Sentry.replayIntegration({
        blockAllMedia: true,
        maskAllText: false,
        // 녹화 안의 브레드크럼·성능 스팬 URL도 4종 콜백을 거치지 않아 이 훅이 씻는다.
        // 단 SDK가 custom 이벤트에만 불러 주므로 rrweb Meta의 href는 여기서 못 씻고,
        // 아래 transport의 makeScrubbingTransport가 막는다.
        beforeAddRecordingEvent: scrubRecordingEvent,
        /**
         * **`transport`의 정제와 한 세트다. 하나만 되돌리면 유출이 부활하거나 수집이 멈춘다.**
         * 압축을 켜면 녹화가 바이트로 직렬화돼 전송 계층에서 문자열 정제가 불가능해지고,
         * 그 경우 transport는 fail-closed로 리플레이를 통째로 버린다.
         */
        useCompression: false,
      }),
    ],
    // 성능 트레이스는 표본만 수집한다 — 에러는 샘플링과 무관하게 전부 잡힌다.
    tracesSampleRate: 0.2,
    // 리플레이는 일반 세션 10% 표본, 에러가 난 세션은 전부 수집한다.
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    // 리플레이 녹화의 userId를 전송 직전에 지우는 최종 방어선. 위 replayIntegration의
    // `useCompression: false`와 한 세트다.
    transport: makeScrubbingTransport,
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

  /**
   * 리플레이 이벤트는 위 4종 콜백을 **하나도 거치지 않는다.** SDK의 `prepareReplayEvent`가
   * `replay_event`를 event processor 경로로만 준비해 보내기 때문이다. event processor는
   * 모든 이벤트에 불리므로 replay_event만 골라 씻는다.
   */
  Sentry.addEventProcessor(scrubReplayEvent);
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

/**
 * 문자열 어디에 있든 `userId` 쿼리 파라미터만 도려낸다.
 *
 * 화이트리스트 방식인 `sanitizeUrl`을 쓰지 않는 이유: 이 함수의 입력은 URL 하나가 아니라
 * **직렬화된 녹화 JSON 전체**라, URL을 찾아내 통째로 재작성하는 방식은 오탐으로 녹화를
 * 망가뜨릴 수 있다. 여기서는 계약의 대상인 `userId=N`만 정확히 지우는 백스톱 역할이고,
 * 구조를 아는 브레드크럼·스팬 경로는 `scrubRecordingEvent`가 화이트리스트로 정제한다.
 *
 * ⚠️ **그래서 이 함수만 화이트리스트가 아니다. 새 식별자 쿼리 파라미터를 도입하면 여기에도
 * 반드시 추가해야 한다.** 다른 모든 경로는 `sanitizeUrl`의 화이트리스트가 자동으로 막지만,
 * 이 백스톱은 아는 파라미터만 지우므로 빠뜨리면 rrweb Meta `href` 경로로만 조용히 샌다.
 */
export function stripUserIdParam(text: string): string {
  // "?userId=7&a=1"은 구분자를 남겨 "?a=1"로, "?userId=7"·"&userId=7"은 통째로 지운다.
  // `code`(소셜룸 초대코드)도 같은 규칙으로 지운다 — 렌더러 사망 복원이 룸을 `?code=NNNN`으로
  // 다시 열어(BY-436) rrweb Meta `href`에 실린다. 유효 기간 중에는 방 접근 코드다.
  return text.replace(/([?&])(?:userId|code)=\d+&/g, "$1").replace(/[?&](?:userId|code)=\d+/g, "");
}

type TransportOptions = Parameters<typeof Sentry.makeFetchTransport>[0];
type Transport = ReturnType<typeof Sentry.makeFetchTransport>;
type Envelope = Parameters<Transport["send"]>[0];

/**
 * 리플레이 녹화(`replay_recording`)의 `userId`를 전송 직전에 지우는 transport.
 *
 * rrweb Meta 이벤트는 세그먼트마다 `window.location.href`를 원본 그대로 싣는데, SDK의
 * `beforeAddRecordingEvent`는 custom 이벤트에만 불려서 훅으로는 못 씻는다. 2026-08-20 codex
 * 리뷰에서 발견된 갭이다. 녹화가 직렬화된 문자열로 오는 마지막 지점이 여기라 전송 계층에서
 * 지운다. 압축 바이트처럼 정제할 수 없는 형태면 **리플레이를 보내지 않는다.** 유출보다
 * 수집 손실이 낫다는 fail-closed 판단이다. 에러·트랜잭션 등 다른 envelope는 손대지 않는다.
 */
export function makeScrubbingTransport(options: TransportOptions): Transport {
  const inner = Sentry.makeFetchTransport(options);
  return {
    flush: (timeout) => inner.flush(timeout),
    send: (envelope: Envelope) => {
      const items = envelope[1] as [{ type?: string; length?: number }, unknown][];
      for (const item of items) {
        if (item[0]?.type !== "replay_recording") continue;
        const payload = item[1];
        if (typeof payload !== "string") {
          return Promise.resolve({});
        }
        const scrubbed = stripUserIdParam(payload);
        item[1] = scrubbed;
        // envelope 규약: length 헤더는 payload의 UTF-8 바이트 수다. 정제로 짧아진 만큼
        // 갱신하지 않으면 인제스트가 옛 길이만큼 읽어 뒤 아이템까지 잘못 파싱한다.
        item[0].length = new TextEncoder().encode(scrubbed).length;
      }
      return inner.send(envelope);
    },
  };
}

/** rrweb 이벤트 타입 상수. `@sentry-internal/rrweb`의 `EventType` 값이다. */
const RRWEB_CUSTOM_EVENT = 5;

/**
 * 리플레이 녹화 페이로드 한 건의 URL을 씻는 `beforeAddRecordingEvent` 훅.
 *
 * ⚠️ SDK의 `maybeApplyCallback`이 `isCustomEvent`로 걸러 이 콜백을 **custom 이벤트에만**
 * 부른다. 그래서 rrweb Meta 이벤트가 세그먼트마다 싣는 `window.location.href` 원본은
 * 여기서 못 씻고, 전송 계층의 `makeScrubbingTransport`가 막는다.
 *
 * custom 이벤트 중 URL을 담는 두 종류를 씻는다.
 * - 녹화 안 브레드크럼: 네비게이션의 `from`/`to`. 이벤트 쪽 브레드크럼과 별개 사본이라
 *   `beforeBreadcrumb`이 못 미친다.
 * - 성능 스팬: `navigation.*`·`resource.*`의 `description`이 요청 URL이고, `navigation.push`는
 *   `data.previous`에 이전 URL도 담는다. `statsApi.ts`가 `?userId=N`으로 호출하는 경로다.
 *   `memory` 등 URL이 아닌 스팬은 건드리지 않는다. 정제 함수가 `"memory"`를 경로로 오인해
 *   망가뜨리기 때문이다.
 */
export function scrubRecordingEvent<E extends { type: number; data?: unknown }>(event: E): E {
  if (event.type !== RRWEB_CUSTOM_EVENT) return event;

  const data = event.data as { tag?: unknown; payload?: unknown } | undefined;
  if (data?.tag === "breadcrumb" && typeof data.payload === "object" && data.payload !== null) {
    scrubBreadcrumb(data.payload as Sentry.Breadcrumb);
  } else if (data?.tag === "performanceSpan") {
    const payload = data.payload as
      { op?: unknown; description?: unknown; data?: { previous?: unknown } } | undefined;
    if (typeof payload?.op === "string" && /^(navigation|resource)/.test(payload.op)) {
      if (typeof payload.description === "string") {
        payload.description = sanitizeUrl(payload.description);
      }
      if (typeof payload.data?.previous === "string") {
        payload.data.previous = sanitizeUrl(payload.data.previous);
      }
    }
  }
  return event;
}

/**
 * 리플레이 이벤트 `replay_event`의 URL을 씻는다. 방문 URL 목록 `urls`와 `request.url`에
 * `?userId=N`이 원본 그대로 실리는데, 이 이벤트는 `beforeSend` 계열이 불리지 않는 유일한
 * 전송 경로라 `initSentry`가 event processor로 등록해 막는다.
 */
export function scrubReplayEvent<E extends Sentry.Event>(event: E): E {
  if (event.type !== "replay_event") return event;

  // `urls`는 ReplayEvent 전용 필드라 공용 `Event` 타입에 없다. 구조만 보고 씻는다.
  const replay = event as E & { urls?: unknown };
  if (Array.isArray(replay.urls)) {
    replay.urls = replay.urls.map((url) => (typeof url === "string" ? sanitizeUrl(url) : url));
  }
  if (event.request?.url !== undefined) {
    event.request.url = sanitizeUrl(event.request.url);
  }
  return event;
}

/** React 렌더 에러를 Sentry로 보내는 createRoot 옵션 (React 19 에러 훅). */
export const sentryRootOptions = {
  onUncaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
};
