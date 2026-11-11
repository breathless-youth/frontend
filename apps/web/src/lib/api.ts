import { apiVersionFor } from "@focusmakers/types";
import type { ApiEndpoint, ApiErrorBody } from "@focusmakers/types";

import { beginApiLatency } from "@/lib/apiLatency";

/** `apiFetch`가 받는 init — 엔드포인트 키가 필수다. 빠뜨리면 컴파일에서 걸린다. */
export interface ApiFetchInit extends RequestInit {
  readonly endpoint: ApiEndpoint;
}

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
 * 요청이 우리 API로 가는지. 기준은 빌드가 정한 API 주소의 origin이고, 로컬처럼 값이 비어 있으면
 * 현재 문서의 origin이 된다(same-origin 프록시). 파싱이 안 되면 다른 origin으로 본다.
 */
function isApiOrigin(input: RequestInfo | URL): boolean {
  // instanceof 대신 모양으로 가른다 — 다른 realm(iframe)의 Request는 instanceof에 걸리지 않고,
  // 그러면 "[object Request]"가 상대 경로로 풀려 현재 문서 origin으로 오판된다.
  const url = typeof input === "string" ? input : "url" in input ? input.url : input.href;
  try {
    return new URL(url, location.href).origin === new URL(API_BASE_URL, location.href).origin;
  } catch {
    return false;
  }
}

/**
 * 모든 호출이 거치는 공통 fetch 래퍼
 *
 * `API-Version`은 **엔드포인트마다 다르다**(`API_ENDPOINTS`). 전역 기본값을 두면 어떤 요청에는 반드시
 * 틀린 값이 나가고 서버가 400을 준다 — 그래서 호출부가 자기 엔드포인트 키를 반드시 넘긴다.
 *
 * 값을 고르는 기준은 **이 문서가 어느 계약을 말하느냐**다. 토큰 출처가 없으면(구 앱 웹뷰·브라우저 단독)
 * 구 계약을, 있으면 현재 계약을 쓴다. "지금 토큰을 들고 있느냐"가 아니다 — 부팅 직후나 갱신 중에는
 * 토큰이 잠깐 없지만 그 문서는 여전히 현재 계약을 말한다.
 */
export async function apiFetch(input: RequestInfo | URL, init: ApiFetchInit): Promise<Response> {
  const { endpoint, ...requestInit } = init;
  // fetch와 시그니처를 맞춰 Request 입력도 받는다. init.headers가 없으면 Request가
  // 실어 온 헤더를 기준으로 삼아야 그 헤더가 유실되지 않는다.
  const baseHeaders =
    requestInit.headers ??
    (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
  const headers = new Headers(baseHeaders);
  // init에 signal이 없으면 Request 입력이 실어 온 signal을 대신 본다 — headers와 같은 이유다.
  const signal =
    requestInit.signal ??
    (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined);
  // 재시도는 같은 input·init(본문 문자열·AbortSignal 포함)을 그대로 다시 보낸다 — headers만 갱신된다.
  // ponytail: 본문 있는 Request 객체 입력은 재시도에서 본문이 이미 소비돼 실패한다. 호출부는 전부 문자열
  // URL + init이라 clone()을 두지 않았다. Request 입력을 쓰게 되면 그때 더한다.
  // 응답 시간은 토큰 대기를 빼고 서버 왕복만 잰다. 실패 응답은 속도가 아니라 오류라 넣지 않는다.
  const send = async () => {
    const finishLatency = beginApiLatency();
    const res = await fetch(input, { ...requestInit, headers });
    if (res.ok && isApiOrigin(input)) finishLatency();
    return res;
  };

  // 토큰 출처가 없으면(브라우저 단독, guestAuth 표시 없는 구버전 셸) 구 계약으로 말한다.
  const source = getTokenSource();
  headers.set("API-Version", apiVersionFor(endpoint, source === null));
  // 다른 origin에는 토큰을 싣지 않는다. 401이 와도 우리 토큰 문제가 아니라 갱신하지 않는다.
  if (source === null || !isApiOrigin(input)) {
    return send();
  }
  let owner = source.getUserId();
  // 최초 auth-ready 왕복만 첫 확정 신원을 기다린다. 이미 신원이 있던 요청은 다른 계정으로 넘어갈 수 없다.
  let firstIdentityPending = owner === null && !source.hasSettled();
  let changedAccount = false;
  const unsubscribe = source.subscribe((snapshot) => {
    if (firstIdentityPending) {
      owner = snapshot.userId;
      firstIdentityPending = false;
    } else if (snapshot.userId !== owner) {
      // A → B → A도 원래 요청을 재개하지 않는다.
      changedAccount = true;
    }
  });
  const identityChanged = () =>
    changedAccount || getTokenSource() !== source || source.getUserId() !== owner;
  try {
    const sent = await source.getAccessToken();
    if (firstIdentityPending) {
      owner = source.getUserId();
      firstIdentityPending = false;
    }
    if (identityChanged()) throw new DOMException("request account changed", "AbortError");
    if (sent !== null) {
      headers.set("Authorization", `Bearer ${sent}`);
    }
    const res = await send();
    // 서버가 이미 처리한 요청은 되돌릴 수 없지만 이전 계정 작업의 후속 단계는 중단한다.
    if (identityChanged()) throw new DOMException("request account changed", "AbortError");
    // 만료 판단은 서버의 401만 믿는다. 401 경로는 status만 읽는다 — 테스트가 fetch를 얇은 객체로 mock한다.
    if (res.status !== 401 || signal?.aborted) {
      return res;
    }
    // 같은 계정의 토큰만 1회 갱신해 재시도한다. 로그인·로그아웃으로 바뀐 계정에 이전 요청 본문을 보내지 않는다.
    // 다른 문서가 이미 갱신했으면 현재 토큰을 쓰고, 버전과 본문·signal은 원래 요청 그대로 둔다.
    const current = source.getCurrentToken();
    const next = current !== sent ? current : await source.refresh();
    if (identityChanged()) throw new DOMException("request account changed", "AbortError");
    if (signal?.aborted || next === null || next === sent) {
      return res;
    }
    headers.set("Authorization", `Bearer ${next}`);
    const retried = await send();
    if (identityChanged()) throw new DOMException("request account changed", "AbortError");
    return retried;
  } finally {
    unsubscribe();
  }
}
