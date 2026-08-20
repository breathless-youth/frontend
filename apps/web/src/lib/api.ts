/**
 * 공용 API 베이스. 기본값은 same-origin — dev에서는 vite.config.ts의 /api 프록시가
 * 백엔드로 전달한다(CORS 우회). 배포 시 VITE_API_BASE_URL로 지정.
 * (BY-328에서 submitStudySession.ts의 로컬 상수를 승격 — 홈·기록·설정 API도 같은 베이스를 쓴다.)
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";

/**
 * 실패 응답(`!res.ok`)에서 서버 에러 계약 `{ message }`를 읽어 Error를 만든다.
 * 본문이 없거나 JSON이 아니면 `` `${fallback} (HTTP ${status})` ``로 대체한다.
 * (apps/mobile/lib/api.ts에서 이식 — 웹 이관 완료 후 모바일 쪽은 BY-333에서 삭제된다.)
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
 * 서버 공통 에러 계약 `{ code, message }`를 실은 에러 (BY-409).
 * 화면 문구는 `message`가 아니라 **`code`로만 분기**한다(BY-404 명세 규칙) — `message`는
 * 로그·폴백용이다. `parseErrorMessage`는 code가 필요 없는 기존 호출처(stats·제출)가 그대로 쓴다.
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
    .then((parsed: { code?: string; message?: string }) => parsed)
    .catch(() => undefined);
  return new ApiError(body?.message ?? `${fallback} (HTTP ${res.status})`, res.status, body?.code);
}
