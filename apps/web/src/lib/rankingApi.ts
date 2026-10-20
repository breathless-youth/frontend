import type {
  MedalRank,
  RankingBoardResponse,
  RankingPeriod,
  RankingRecordSeenRequest,
  RankingRecordType,
  RankingRecordsPage,
  RankingRecordsSummary,
  RankingSessionGainsResponse,
  RankingType,
  RankingUnseenResponse,
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
 * 한 번에 본 것으로 표시할 수 있는 기록 수
 *
 * 넘기면 서버가 통째로 400을 준다.
 */
const SEEN_LIMIT = 100;

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

type RankingGetEndpoint =
  "rankingBoard" | "rankingRecordsSummary" | "rankingRecords" | "rankingRecordsUnseen";

async function getJson<T>(
  path: string,
  endpoint: RankingGetEndpoint,
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

/**
 * 안 본 메달 조회
 *
 * 홈 메달 모달이 띄울 기록과 누적 메달 수를 받는다.
 */
export async function getRankingRecordsUnseen(
  signal?: AbortSignal,
): Promise<RankingUnseenResponse> {
  const dev = await devMock();
  if (dev !== null) {
    return dev.mock.mockUnseen(dev.scene);
  }
  return getJson(
    "/api/rankings/records/unseen",
    "rankingRecordsUnseen",
    "안 본 랭킹 기록 조회 실패",
    signal,
  );
}

/**
 * 메달 본 것으로 표시
 *
 * 빈 목록은 서버에서도 아무 일이 없어 보내지 않는다.
 * 안 본 기록 응답이 100개까지라 넘칠 일은 없지만, 넘으면 전부 거절되므로 앞 100개만 보낸다.
 */
export async function postRankingRecordsSeen(ids: readonly number[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  // 가짜 응답 장면에서는 서버에 적지 않아 새 실행마다 같은 메달을 다시 볼 수 있다.
  if ((await devMock()) !== null) {
    return;
  }
  const body: RankingRecordSeenRequest = { ids: ids.slice(0, SEEN_LIMIT) };
  const res = await apiFetch(`${API_BASE_URL}/api/rankings/records/seen`, {
    endpoint: "rankingRecordsSeen",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await parseApiError(res, "랭킹 기록 본 것 표시 실패");
  }
}

/**
 * 세션 뒤 오른 순위 조회
 *
 * `startedAt`은 제출한 세션의 시작 시각이다.
 * 그 시각으로 제출된 내 세션이 없으면 서버가 404를 주는데, 결과 화면에는 오른 판이 없는 것과 같아 빈 응답으로 바꾼다.
 */
export async function getRankingSessionGains(
  startedAt: string,
  signal?: AbortSignal,
): Promise<RankingSessionGainsResponse> {
  const dev = await devMock();
  if (dev !== null) {
    return dev.mock.mockSessionGains(dev.scene);
  }
  const res = await apiFetch(
    `${API_BASE_URL}/api/rankings/session-gains${toQuery([["startedAt", startedAt]])}`,
    { endpoint: "rankingSessionGains", method: "GET", signal },
  );
  if (res.status === 404) {
    return { weekly: null, others: [] };
  }
  if (!res.ok) {
    throw await parseApiError(res, "세션 뒤 랭킹 조회 실패");
  }
  return (await res.json()) as RankingSessionGainsResponse;
}
