import type { ApiErrorBody } from "@focusmakers/types";

/**
 * 공용 API 베이스
 *
 * 빌드 컨텍스트가 결정한다(scripts/resolveApiBase.ts — 환경과 주소가
 * 어긋나면 빌드가 실패한다). 로컬 개발은 빈 값(same-origin)이라 vite.config.ts의
 * /api 프록시가 백엔드로 전달한다(CORS 우회).
 */
export const API_BASE_URL: string = __API_BASE__;

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
 * 서버 공통 에러 계약 `{ code, message }`를 실은 에러
 *
 * 화면 문구는 message가 아니라 code로만 분기한다
 * — message는 로그·폴백용이다.
 * - parseErrorMessage는 code가 필요 없는 기존 호출처(stats·제출)가 그대로 쓴다.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** 실패 응답(`!res.ok`)을 `ApiError`로 파싱한다. 본문이 없거나 JSON이 아니면 fallback 문구. */
export async function parseApiError(
  res: Pick<Response, "status" | "json">,
  fallback: string,
): Promise<ApiError> {
  const body = await res
    .json()
    .then((parsed: ApiErrorBody) => parsed)
    .catch(() => undefined);
  return new ApiError(body?.message ?? `${fallback} (HTTP ${res.status})`, res.status, body?.code);
}

/**
 * 모든 호출이 거치는 공통 fetch 래퍼
 *
 * — 백엔드 버전닝 기본 헤더를 한 곳에서 관리한다. 호출부가 API-Version을 직접 지정하면 그 값이 우선한다.
 */
const DEFAULT_API_VERSION = "1";

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
