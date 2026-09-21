/**
 * 실패 응답(`!res.ok`)에서 서버 에러 계약 `{ message }`를 읽어 Error를 만든다.
 * 본문이 없거나 JSON이 아니면 `` `${fallback} (HTTP ${status})` ``로 대체한다.
 */
export async function parseErrorMessage(
  res: Pick<Response, "status" | "json">,
  fallback: string,
): Promise<Error> {
  const message = await res
    .json()
    .then((body: { message?: string }) => body.message)
    .catch(() => undefined);
  return new Error(message ?? `${fallback} (HTTP ${res.status})`);
}

/**
 * 모든 REST 호출이 거치는 공통 fetch 래퍼
 *
 * — 백엔드 버전닝 기본 헤더를 한 곳에서 관리한다. 이 앱이 호출하는 API는
 * 등록(POST /api/users)과 토큰 갱신(POST /api/auth/refresh) 둘뿐이고, 등록은
 * API-Version 2에서만 응답에 accessToken·refreshToken을 실어 준다. 그래서
 * 기본값을 2로 둔다. 호출부가 API-Version을 직접 지정하면 그 값이 우선한다.
 */
const DEFAULT_API_VERSION = "2";

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // fetch와 시그니처를 맞춰 Request 입력도 받는다. init.headers가 없으면 Request가
  // 실어 온 헤더를 기준으로 삼아야 그 헤더가 유실되지 않는다.
  const baseHeaders =
    init?.headers ??
    (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
  const headers = new Headers(baseHeaders);
  if (!headers.has("API-Version")) {
    headers.set("API-Version", DEFAULT_API_VERSION);
  }
  return fetch(input, { ...init, headers });
}
