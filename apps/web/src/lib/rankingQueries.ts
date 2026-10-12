import type { MedalRank, RankingRecordType } from "@focusmakers/types";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import {
  getRankingBoard,
  getRankingHome,
  getRankingRecords,
  getRankingRecordsSummary,
  getRankingRecordsUnseen,
  getRankingSessionGains,
  type RankingBoardParams,
} from "./rankingApi";

export interface RecordsFilter {
  rank?: MedalRank;
  type?: RankingRecordType;
  size: number;
}

export const rankingKeys = {
  all: ["ranking"] as const,
  board: (userId: number, params: RankingBoardParams) =>
    [
      "ranking",
      "board",
      userId,
      params.type,
      params.period ?? null,
      params.slot ?? null,
      params.offset ?? 0,
    ] as const,
  summary: (userId: number) => ["ranking", "records", "summary", userId] as const,
  records: (userId: number, filter: RecordsFilter) =>
    [
      "ranking",
      "records",
      "list",
      userId,
      filter.rank ?? "all",
      filter.type ?? "all",
      filter.size,
    ] as const,
  home: (userId: number, since: string) => ["ranking", "home", userId, since] as const,
  unseen: (userId: number) => ["ranking", "records", "unseen", userId] as const,
  sessionGains: (userId: number, startedAt: string) =>
    ["ranking", "session-gains", userId, startedAt] as const,
};

/**
 * 받지 못하는 조회
 *
 * 오프라인이면 TanStack Query가 요청을 멈춰 두므로, 받은 적 없는 조회는 오류 없이 불러오는 중에 머문다.
 * 그래서 멈춘 조회도 실패한 조회처럼 다뤄 데이터가 없을 때 오류와 다시 시도를 보인다.
 * 연결이 돌아오면 멈춘 요청이 이어서 돌아 화면이 저절로 채워진다.
 */
export function cannotLoad(query: { isError: boolean; isPaused: boolean }): boolean {
  return query.isError || query.isPaused;
}

/**
 * 지금 판 폴링 주기
 *
 * 서버 캐시는 지금 판 10초, 지난 기간과 명예의 전당 60초다.
 */
export const LIVE_POLL_MS = 15_000;

/**
 * 랭킹판 queryOptions
 *
 * 서버 캐시는 지금 판 10초, 지난 기간과 명예의 전당 60초다.
 * 순공·시간대 지금 판은 10초 동안 신선하게 두고, 보이는 동안만 폴링하며, 가려지면 focusManager가 멈춘다.
 * 집중률 지금 판과 명예의 전당은 60초, 마감이 끝난 지난 기간은 5분 동안 신선하게 둔다.
 */
export function rankingBoardQuery(userId: number, params: RankingBoardParams) {
  const offset = params.offset ?? 0;
  const live = offset === 0 && (params.type === "FOCUS_TIME" || params.type === "TIME_SLOT");
  return queryOptions({
    queryKey: rankingKeys.board(userId, params),
    queryFn: ({ signal }) => getRankingBoard(params, signal),
    staleTime: offset === -1 ? 5 * 60_000 : live ? 10_000 : 60_000,
    refetchInterval: live ? LIVE_POLL_MS : false,
    refetchIntervalInBackground: false,
  });
}

export function rankingSummaryQuery(userId: number) {
  return queryOptions({
    queryKey: rankingKeys.summary(userId),
    queryFn: ({ signal }) => getRankingRecordsSummary(signal),
    staleTime: 60_000,
  });
}

export function rankingRecordsQuery(userId: number, filter: RecordsFilter) {
  return infiniteQueryOptions({
    queryKey: rankingKeys.records(userId, filter),
    queryFn: ({ pageParam, signal }) => getRankingRecords({ ...filter, cursor: pageParam }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 60_000,
  });
}

/**
 * 홈 추월 queryOptions
 *
 * 하루 한 번만 묻고 그 결과를 다시 쓰지 않아 신선하다고 보지 않는다.
 */
export function rankingHomeQuery(userId: number, since: string) {
  return queryOptions({
    queryKey: rankingKeys.home(userId, since),
    queryFn: ({ signal }) => getRankingHome(since, signal),
    staleTime: 0,
  });
}

/**
 * 안 본 메달 queryOptions
 *
 * 본 것으로 표시하면 바로 달라지므로 신선하다고 보지 않는다.
 */
export function rankingUnseenQuery(userId: number) {
  return queryOptions({
    queryKey: rankingKeys.unseen(userId),
    queryFn: ({ signal }) => getRankingRecordsUnseen(signal),
    staleTime: 0,
  });
}

/**
 * 세션 뒤 오른 순위 queryOptions
 *
 * 끝난 제출 하나의 결과라 결과 화면에 있는 동안 다시 받지 않는다.
 */
export function rankingSessionGainsQuery(userId: number, startedAt: string) {
  return queryOptions({
    queryKey: rankingKeys.sessionGains(userId, startedAt),
    queryFn: ({ signal }) => getRankingSessionGains(startedAt, signal),
    staleTime: Infinity,
  });
}
