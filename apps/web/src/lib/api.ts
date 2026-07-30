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
