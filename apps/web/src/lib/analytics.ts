declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * GA4 초기화. `VITE_GA4_MEASUREMENT_ID`가 없으면 아무것도 하지 않는다 —
 * 로컬 개발·테스트는 측정 ID 없이 그대로 돌아간다.
 *
 * SPA라 자동 page_view를 끄고(`send_page_view: false`) 라우트 변경마다
 * `AnalyticsRouteTracker`가 `trackPageView()`로 직접 보낸다 — Enhanced Measurement의
 * History 감지에 맡기면 초기 진입과 중복 집계될 수 있다.
 */
export function initGA4() {
  const id = import.meta.env.VITE_GA4_MEASUREMENT_ID;
  if (!id || window.gtag) return;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // gtag.js는 배열이 아니라 Arguments 객체를 기대한다 — rest 파라미터로 바꾸면 명령이 무시된다.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", id, { send_page_view: false });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

/**
 * 분석 전송을 허용하는 쿼리 파라미터 화이트리스트. 여기 없는 파라미터는 전부 버린다 —
 * 특히 네이티브 셸 계약인 `?userId=N`(사용자 식별자)이 제3자(Google)로 나가면 안 된다.
 */
const ALLOWED_SEARCH_PARAMS = ["appVersion", "detector"];

/**
 * 분석용 경로 정제 — 식별자를 지운다.
 * 숫자 경로 세그먼트는 `:id`로 템플릿화(`/room/42/result` → `/room/:id/result`),
 * 쿼리스트링은 화이트리스트만 남긴다.
 */
export function sanitizePagePath(pathname: string, search: string): string {
  const path = pathname
    .split("/")
    .map((segment) => (/^\d+$/.test(segment) ? ":id" : segment))
    .join("/");

  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of ALLOWED_SEARCH_PARAMS) {
    const value = params.get(key);
    if (value !== null) kept.set(key, value);
  }

  const query = kept.toString();
  return query ? `${path}?${query}` : path;
}

/** 현재 라우트의 page_view를 전송한다. 경로는 정제를 거치며, GA4 미초기화면 no-op. */
export function trackPageView(pathname: string, search: string) {
  const path = sanitizePagePath(pathname, search);
  window.gtag?.("event", "page_view", {
    page_path: path,
    // 원본 location.href에는 userId 쿼리가 그대로 있어 쓰지 않는다.
    page_location: window.location.origin + path,
    page_title: document.title,
  });
}
