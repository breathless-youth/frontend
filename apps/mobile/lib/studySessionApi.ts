import Constants from "expo-constants";

import type { SubmitPayload } from "@focuson/study-core";
import type { StudySessionResponse } from "@focuson/types";

import { parseErrorMessage } from "./api";

function apiBaseUrl(): string {
  const url = Constants.expoConfig?.extra?.apiBaseUrl as string | undefined;
  if (!url) {
    throw new Error("app.json extra.apiBaseUrl이 설정되지 않았습니다");
  }
  return url;
}

/** 세션 제출 실패 — status로 4xx(폐기)/그 외(유지)를 호출자가 구분한다. */
export class StudySessionSubmitError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "StudySessionSubmitError";
  }
}

/** 자정(KST)을 넘는 제출은 서버가 날짜별로 분할해 배열로 돌려준다(계약). */
export async function submitStudySession(
  userId: number,
  payload: SubmitPayload,
): Promise<StudySessionResponse[]> {
  const res = await fetch(`${apiBaseUrl()}/api/study-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, ...payload }),
  });
  if (!res.ok) {
    const error = await parseErrorMessage(res, "세션 제출 실패");
    throw new StudySessionSubmitError(error.message, res.status);
  }
  return (await res.json()) as StudySessionResponse[];
}
