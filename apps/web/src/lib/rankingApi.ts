import type {
  MedalRank,
  RankingBoardResponse,
  RankingPeriod,
  RankingRecordType,
  RankingRecordsPage,
  RankingRecordsSummary,
  RankingType,
  TimeSlot,
} from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";

export interface RankingBoardParams {
  type: RankingType;
  period?: RankingPeriod;
  slot?: TimeSlot;
  offset?: 0 | -1;
}

export interface RankingRecordsParams {
  rank?: MedalRank;
  type?: RankingRecordType;
  cursor?: string | null;
  size: number;
}

/**
 * 쿼리 문자열 만들기
 *
 * 값이 있는 것만 순서대로 쿼리 문자열로 만든다.
 */
function toQuery(pairs: [string, string | number | null | undefined][]): string {
  const parts = pairs
    .filter((pair): pair is [string, string | number] => pair[1] !== undefined && pair[1] !== null)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return parts.length === 0 ? "" : `?${parts.join("&")}`;
}

async function getJson<T>(
  path: string,
  endpoint: "rankingBoard" | "rankingRecordsSummary" | "rankingRecords",
  fallback: string,
  signal?: AbortSignal,
): Promise<T> {
  const res = await apiFetch(`${API_BASE_URL}${path}`, { endpoint, method: "GET", signal });
  if (!res.ok) {
    throw await parseApiError(res, fallback);
  }
  return (await res.json()) as T;
}

/**
 * 개발 모드 가짜 응답
 *
 * `import.meta.env.DEV`가 거짓인 운영 빌드에서는 이 분기와 동적 import가 통째로 빠진다.
 */
async function devMock() {
  if (!import.meta.env.DEV) {
    return null;
  }
  const mock = await import("./rankingMock");
  const scene = mock.activeRankingScene();
  return scene === null ? null : { mock, scene };
}

/**
 * 랭킹판 조회
 *
 * 기본값인 지금 기간(`offset=0`)은 보내지 않는다.
 */
export async function getRankingBoard(
  params: RankingBoardParams,
  signal?: AbortSignal,
): Promise<RankingBoardResponse> {
  const dev = await devMock();
  if (dev !== null) {
    return dev.mock.mockBoard(dev.scene, params);
  }
  const query = toQuery([
    ["type", params.type],
    ["period", params.period],
    ["slot", params.slot],
    ["offset", params.offset === -1 ? -1 : undefined],
  ]);
  return getJson(`/api/rankings/board${query}`, "rankingBoard", "랭킹 조회 실패", signal);
}

export async function getRankingRecordsSummary(
  signal?: AbortSignal,
): Promise<RankingRecordsSummary> {
  const dev = await devMock();
  if (dev !== null) {
    return dev.mock.mockSummary(dev.scene);
  }
  return getJson(
    "/api/rankings/records/summary",
    "rankingRecordsSummary",
    "랭킹 기록 요약 조회 실패",
    signal,
  );
}

export async function getRankingRecords(
  params: RankingRecordsParams,
  signal?: AbortSignal,
): Promise<RankingRecordsPage> {
  const dev = await devMock();
  if (dev !== null) {
    return dev.mock.mockRecords(dev.scene, params);
  }
  const query = toQuery([
    ["rank", params.rank],
    ["type", params.type],
    ["cursor", params.cursor],
    ["size", params.size],
  ]);
  return getJson(`/api/rankings/records${query}`, "rankingRecords", "랭킹 기록 조회 실패", signal);
}
