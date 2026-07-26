import Constants from "expo-constants";

import type { StudySessionListResponse, StudySessionStreakResponse } from "@focuson/types";

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
    const message = await res
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => undefined);
    throw new Error(message ?? `통계 조회 실패 (HTTP ${res.status})`);
  }
  return (await res.json()) as StudySessionListResponse;
}

export async function getStreak(userId: number): Promise<StudySessionStreakResponse> {
  const res = await fetch(`${apiBaseUrl()}/api/stats/streak?userId=${userId}`, {
    method: "GET",
  });
  if (!res.ok) {
    const message = await res
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => undefined);
    throw new Error(message ?? `스트릭 조회 실패 (HTTP ${res.status})`);
  }
  return (await res.json()) as StudySessionStreakResponse;
}
