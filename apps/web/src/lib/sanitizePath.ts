/**
 * 제3자로 나가는 경로·URL에서 사용자 식별자를 지우는 규칙. **GA4와 Sentry가 함께 쓴다.**
 *
 * 웹뷰는 모든 탭을 `?userId=N`으로 연다(네이티브 셸 계약). 그 값이 Google이든 Sentry든
 * 밖으로 나가면 안 되는데, 두 곳에 규칙을 따로 두면 한쪽만 고치는 사고가 난다. 그래서
 * 화이트리스트와 정제 함수를 여기 한 곳에 두고 양쪽이 import 한다.
 *
 * (원래 `analytics.ts`에 있었으나 `sanitizeUrl`은 GA4가 쓰지 않아 `sentry.ts → analytics.ts`
 * 의존이 생겼다. 화이트리스트 단일 출처는 유지하면서 방향성만 끊어낸 분리다.)
 */

/**
 * 분석 전송을 허용하는 쿼리 파라미터 화이트리스트. 여기 없는 파라미터는 전부 버린다 —
 * 특히 네이티브 셸 계약인 `?userId=N`(사용자 식별자)이 제3자로 나가면 안 된다.
 *
 * **새 쿼리를 분석에 쓰려면 여기에 명시적으로 추가한다.** 한 번 고치면 GA4·Sentry 양쪽에
 * 동시에 반영된다.
 */
const ALLOWED_SEARCH_PARAMS = ["appVersion", "detector"];

/** URL 파싱이 실패했을 때 남기는 표식. 빈 문자열로 두면 "원래 없었던 값"과 구분되지 않는다. */
export const UNPARSEABLE_URL = "[unparseable]";

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

/** `https://host/path` · `//host/path` 처럼 호스트를 담고 있던 입력인지. */
const HAS_HOST = /^([a-z][a-z0-9+.-]*:)?\/\//i;

/**
 * URL 문자열을 `sanitizePagePath` 규칙으로 정제한다. Sentry가 담는 `request.url`,
 * 브레드크럼, 스팬 속성이 대상이다.
 *
 * - **호스트가 있던 입력은 호스트를 살린다.** 프로토콜 상대 URL(`//other.host/x`)도 포함 —
 *   여기서 호스트를 흘리면 "어느 서버 호출이 실패했는지"를 잃는다.
 * - **상대 경로는 상대로 돌려준다.** 브레드크럼의 `from`/`to`에 origin을 붙이면 이력이 읽기 나빠진다.
 * - **http(s)가 아닌 스킴은 스킴만 남기고 버린다.** `blob:`·`data:`·`about:` 등은 `origin`이
 *   `"null"`이거나 전체가 `pathname`에 들어가서, 그대로 정제하면 `"nulltext/html,<b>hi</b>"`
 *   같은 망가진 문자열이 나온다. 특히 `data:` URL은 본문을 통째로 담고 있어 **정제를 그냥
 *   통과해버린다** — 스킴만 남기는 게 안전하고 진단에도 충분하다.
 */
export function sanitizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw, window.location.origin);
  } catch {
    return UNPARSEABLE_URL;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return url.protocol;
  }

  const path = sanitizePagePath(url.pathname, url.search);
  return HAS_HOST.test(raw) ? url.origin + path : path;
}
