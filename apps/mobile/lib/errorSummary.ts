/**
 * 로그에 남길 오류 요약
 *
 * 결제 SDK 오류에는 결제용 ID나 스토어 계정 정보가, 광고 SDK 오류에는 서버 확인에 실은 사용자 ID가 실릴 수 있다.
 * 콘솔 로그는 Sentry가 모을 수 있어 오류 객체를 통째로 넘기지 않고 코드나 이름만 남긴다.
 */
export function errorSummary(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" || typeof code === "number") {
    return `code ${code}`;
  }
  return error instanceof Error ? error.name : "unknown";
}
