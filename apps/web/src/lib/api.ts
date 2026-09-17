import type { ApiErrorBody } from "@focusmakers/types";

import { getTokenSource } from "./auth/tokenSource";

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

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // fetch와 시그니처를 맞춰 Request 입력도 받는다. init.headers가 없으면 Request가
  // 실어 온 헤더를 기준으로 삼아야 그 헤더가 유실되지 않는다.
  const baseHeaders =
    init?.headers ??
    (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
  const headers = new Headers(baseHeaders);
  if (!headers.has("API-Version")) {
    headers.set("API-Version", DEFAULT_API_VERSION);
  }
  // init에 signal이 없으면 Request 입력이 실어 온 signal을 대신 본다 — headers와 같은 이유다.
  const signal =
    init?.signal ??
    (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined);
  // 재시도는 같은 input·init(본문 문자열·AbortSignal 포함)을 그대로 다시 보낸다 — headers만 갱신된다.
  // ponytail: 본문 있는 Request 객체 입력은 재시도에서 본문이 이미 소비돼 실패한다. 호출부는 전부 문자열
  // URL + init이라 clone()을 두지 않았다. Request 입력을 쓰게 되면 그때 더한다.
  const send = () => fetch(input, { ...init, headers });

  // 토큰 출처가 없으면(브라우저 단독, guestAuth 표시 없는 구버전 셸) 오늘 동작 그대로다.
  const source = getTokenSource();
  if (source === null) {
    return send();
  }
  const sent = await source.getAccessToken();
  if (sent !== null) {
    headers.set("Authorization", `Bearer ${sent}`);
  }
  const res = await send();
  // 만료 판단은 서버의 401만 믿는다. 401 경로는 status만 읽는다 — 테스트가 fetch를 얇은 객체로 mock한다.
  if (res.status !== 401 || signal?.aborted) {
    return res;
  }
  // 다른 문서의 갱신이 이미 토큰을 바꿔 뒀으면 갱신 요청 없이 그 토큰으로 재시도한다. 아니면 갱신을
  // 요청하고(문서당 하나로 묶임) 1회만 재시도한다. 갱신이 실패했거나 같은 토큰이면 재시도해도 같은
  // 401이라 보내지 않는다. 재시도의 401은 그대로 돌려준다 — 갱신 루프 없음.
  const current = source.getCurrentToken();
  const next = current !== sent ? current : await source.refresh();
  if (signal?.aborted) {
    return res;
  }
  if (next === null || next === sent) {
    return res;
  }
  headers.set("Authorization", `Bearer ${next}`);
  return send();
}
