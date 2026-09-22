import { apiVersionFor } from "@focusmakers/types";
import type { ApiEndpoint } from "@focusmakers/types";

/** `apiFetch`가 받는 init — 엔드포인트 키가 필수다. 빠뜨리면 컴파일에서 걸린다. */
export interface ApiFetchInit extends RequestInit {
  readonly endpoint: ApiEndpoint;
}

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
 * `API-Version`은 **엔드포인트마다 다르다**(`API_ENDPOINTS`). 전역 기본값을 두면 어떤 요청에는 반드시
 * 틀린 값이 나가고 서버가 400을 준다 — 그래서 호출부가 자기 엔드포인트 키를 반드시 넘긴다.
 * 네이티브에는 구 앱 계약을 쓰는 문서가 없으므로 언제나 현재 버전이다.
 */
export function apiFetch(input: RequestInfo | URL, init: ApiFetchInit): Promise<Response> {
  const { endpoint, ...requestInit } = init;
  // fetch와 시그니처를 맞춰 Request 입력도 받는다. init.headers가 없으면 Request가
  // 실어 온 헤더를 기준으로 삼아야 그 헤더가 유실되지 않는다.
  const baseHeaders =
    requestInit.headers ??
    (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
  const headers = new Headers(baseHeaders);
  headers.set("API-Version", apiVersionFor(endpoint, false));
  return fetch(input, { ...requestInit, headers });
}
