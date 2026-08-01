import Constants from "expo-constants";

import type { StudySessionListResponse, StudySessionStreakResponse } from "@focusmakers/types";

import { parseErrorMessage } from "./api";

/** 스트릭 기간 조회 범위 — 서버 규칙상 from/to는 항상 함께 보내야 한다(하나만 주면 400). */
export type StreakRange = { from: string; to: string };

function apiBaseUrl(): string {
  const url = Constants.expoConfig?.extra?.apiBaseUrl as string | undefined;
  if (!url) {
    throw new Error("app.json extra.apiBaseUrl이 설정되지 않았습니다");
  }
  return url;
}

export async function listStudySessionStats(
  userId: number,
  date: string,
): Promise<StudySessionListResponse> {
  const res = await fetch(`${apiBaseUrl()}/api/stats?userId=${userId}&date=${date}`, {
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
  const res = await fetch(`${apiBaseUrl()}/api/stats/streak?userId=${userId}${rangeParams}`, {
    method: "GET",
  });
  if (!res.ok) {
    throw await parseErrorMessage(res, "스트릭 조회 실패");
  }
  return (await res.json()) as StudySessionStreakResponse;
}
