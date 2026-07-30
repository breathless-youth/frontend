import type { StudySessionListResponse, StudySessionStreakResponse } from "@focuson/types";

/**
 * 일일 통계·스트릭 조회 (`apps/mobile/lib/statsApi.ts`에서 이식 — BY-329).
 * 홈(S1)과 기록(S5, BY-330)이 함께 쓰므로 feature가 아니라 `lib/`에 둔다.
 *
 * 기본값은 same-origin — dev에서는 vite.config.ts의 /api 프록시가 백엔드로 전달한다(CORS 우회).
 * 배포 시 VITE_API_BASE_URL로 지정. (`submitStudySession.ts`와 같은 관례 — BY-328 공통 API
 * 클라이언트가 생기면 그쪽으로 흡수한다.)
 */
const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";

/** 스트릭 기간 조회 범위 — 서버 규칙상 from/to는 항상 함께 보내야 한다(하나만 주면 400). */
export type StreakRange = { from: string; to: string };

/**
 * 실패 응답(`!res.ok`)에서 서버 에러 계약 `{ message }`를 읽어 Error를 만든다.
 * 본문이 없거나 JSON이 아니면 `` `${fallback} (HTTP ${status})` ``로 대체한다.
 */
async function parseErrorMessage(res: Response, fallback: string): Promise<Error> {
  const message = await res
    .json()
    .then((body: { message?: string }) => body.message)
    .catch(() => undefined);
  return new Error(message ?? `${fallback} (HTTP ${res.status})`);
}

export async function listStudySessionStats(
  userId: number,
  date: string,
): Promise<StudySessionListResponse> {
  const res = await fetch(`${API_BASE_URL}/api/stats?userId=${userId}&date=${date}`, {
    method: "GET",
  });
  if (!res.ok) {
    throw await parseErrorMessage(res, "통계 조회 실패");
  }
  return (await res.json()) as StudySessionListResponse;
}

export async function getStreak(
  userId: number,
  range?: StreakRange,
): Promise<StudySessionStreakResponse> {
  const rangeParams = range ? `&from=${range.from}&to=${range.to}` : "";
  const res = await fetch(`${API_BASE_URL}/api/stats/streak?userId=${userId}${rangeParams}`, {
    method: "GET",
  });
  if (!res.ok) {
    throw await parseErrorMessage(res, "스트릭 조회 실패");
  }
  return (await res.json()) as StudySessionStreakResponse;
}
