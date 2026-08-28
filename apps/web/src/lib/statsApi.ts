import type {
  StudyPeriodStatsResponse,
  StudySessionListResponse,
  StudySessionStreakResponse,
} from "@focusmakers/types";

import { API_BASE_URL, parseErrorMessage } from "./api";

/**
 * 일일 통계·스트릭 조회 (`apps/mobile/lib/statsApi.ts`에서 이식 — BY-329).
 * 홈(S1)과 기록(S5, BY-330)이 함께 쓰므로 feature가 아니라 `lib/`에 둔다.
 * 베이스 URL·에러 파싱은 BY-328의 공용 `lib/api.ts`를 쓴다.
 */

/** 조회 범위 — 서버 규칙상 from/to는 항상 함께 보내야 한다(하나만 주면 400). */
export type DateRange = { from: string; to: string };

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
  range?: DateRange,
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

export async function getPeriodStats(
  userId: number,
  range: DateRange,
  compareRange?: DateRange,
): Promise<StudyPeriodStatsResponse> {
  const compareParams = compareRange
    ? `&compareFrom=${compareRange.from}&compareTo=${compareRange.to}`
    : "";
  const res = await fetch(
    `${API_BASE_URL}/api/stats/period?userId=${userId}&from=${range.from}&to=${range.to}${compareParams}`,
    { method: "GET" },
  );
  if (!res.ok) {
    throw await parseErrorMessage(res, "기간 집계 조회 실패");
  }
  return (await res.json()) as StudyPeriodStatsResponse;
}
