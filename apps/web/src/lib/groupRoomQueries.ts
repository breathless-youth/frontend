import type {
  MyGroupsResponse,
  PublicGroupCard,
  PublicGroupPageResponse,
  StudyCategory,
} from "@focusmakers/types";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { ApiError } from "./api";
import {
  getBlocks,
  getGroupApplications,
  getGroupHome,
  getGroupInvite,
  getGroupMembers,
  getMyApplications,
  getMyGroups,
  getPublicGroup,
  getPublicGroups,
} from "./groupRoomApi";

/** 공개 그룹 목록의 검색 조건 */
export interface PublicGroupFilter {
  query: string;
  category: StudyCategory | null;
}

/**
 * 그룹 쿼리 키
 *
 * 모든 키에 사용자 번호를 넣어 계정이 바뀌면 다른 사람이 받은 그룹을 보이지 않는다.
 * 차단 목록은 그룹 밖에서도 쓰는 기능이라 `groups` 아래에 두지 않는다.
 */
export const groupKeys = {
  all: (userId: number) => ["groups", userId] as const,
  mine: (userId: number) => ["groups", userId, "mine"] as const,
  myApplications: (userId: number) => ["groups", userId, "my-applications"] as const,
  publicLists: (userId: number) => ["groups", userId, "public-list"] as const,
  publicList: (userId: number, filter: PublicGroupFilter) =>
    ["groups", userId, "public-list", filter.query, filter.category ?? "all"] as const,
  publicDetail: (userId: number, groupId: number) => ["groups", userId, "public", groupId] as const,
  home: (userId: number, groupId: number) => ["groups", userId, "home", groupId] as const,
  members: (userId: number, groupId: number) => ["groups", userId, "members", groupId] as const,
  invite: (userId: number, groupId: number) => ["groups", userId, "invite", groupId] as const,
  applications: (userId: number, groupId: number) =>
    ["groups", userId, "applications", groupId] as const,
  blocks: (userId: number) => ["blocks", userId] as const,
};

/** 내 그룹 탭과 그룹 홈을 보이는 동안 다시 받는 주기이고 백엔드와 정한 값이다. */
export const GROUP_POLL_MS = 30_000;

/** 공개 그룹 목록 한 쪽의 크기이고 서버 기본값과 같다. */
export const PUBLIC_PAGE_SIZE = 20;

/**
 * 그룹 조회의 재시도 판단
 *
 * 403과 404 같은 4xx는 다시 받아도 답이 같아서 바로 오류로 보인다.
 * 그 밖의 실패는 한 번만 다시 시도한다.
 * TanStack Query는 이 함수가 받는 오류 타입을 조회의 오류 타입으로 삼아서 기본값과 같은 Error로 받는다.
 */
export function groupQueryRetry(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}

/**
 * 첫 응답을 받지 못한 조회
 *
 * 받아 둔 응답이 있으면 다시 받다 실패해도 화면이 그것을 보이므로 첫 응답이 없을 때만 오류로 본다.
 * 오프라인이라 멈춘 첫 조회도 자리표시에 머물지 않게 오류로 본다.
 */
export function cannotLoadFirst(query: {
  isLoadingError: boolean;
  isPending: boolean;
  isPaused: boolean;
}): boolean {
  return query.isLoadingError || (query.isPending && query.isPaused);
}

// 멤버의 공부 상태가 보이는 두 화면은 보이는 동안 30초마다, 다시 보이면 곧바로 받는다.
// 가려진 탭에서는 focusManager가 앱 탭 보임 신호를 따라 폴링을 멈춘다.
const LIVE_GROUP_OPTIONS = {
  staleTime: 10_000,
  refetchInterval: GROUP_POLL_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: "always",
} as const;

export function myGroupsQuery(userId: number) {
  return queryOptions({
    queryKey: groupKeys.mine(userId),
    queryFn: ({ signal }) => getMyGroups(signal),
    ...LIVE_GROUP_OPTIONS,
    retry: groupQueryRetry,
  });
}

export function groupHomeQuery(userId: number, groupId: number) {
  return queryOptions({
    queryKey: groupKeys.home(userId, groupId),
    queryFn: ({ signal }) => getGroupHome(groupId, signal),
    ...LIVE_GROUP_OPTIONS,
    retry: groupQueryRetry,
  });
}

export function myApplicationsQuery(userId: number) {
  return queryOptions({
    queryKey: groupKeys.myApplications(userId),
    queryFn: ({ signal }) => getMyApplications(signal),
    staleTime: 30_000,
    retry: groupQueryRetry,
  });
}

/**
 * 공개 그룹 목록 infiniteQueryOptions
 *
 * 쪽 번호는 0부터이고 서버가 다음 쪽이 있다고 할 때만 다음 번호를 준다.
 */
export function publicGroupsQuery(userId: number, filter: PublicGroupFilter) {
  return infiniteQueryOptions({
    queryKey: groupKeys.publicList(userId, filter),
    queryFn: ({ pageParam, signal }) =>
      getPublicGroups({ ...filter, page: pageParam, size: PUBLIC_PAGE_SIZE }, signal),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasNext ? pages.length : undefined),
    staleTime: 60_000,
    retry: groupQueryRetry,
  });
}

export function publicGroupQuery(userId: number, groupId: number) {
  return queryOptions({
    queryKey: groupKeys.publicDetail(userId, groupId),
    queryFn: ({ signal }) => getPublicGroup(groupId, signal),
    staleTime: 15_000,
    retry: groupQueryRetry,
  });
}

export function groupMembersQuery(userId: number, groupId: number) {
  return queryOptions({
    queryKey: groupKeys.members(userId, groupId),
    queryFn: ({ signal }) => getGroupMembers(groupId, signal),
    staleTime: 30_000,
    retry: groupQueryRetry,
  });
}

export function groupInviteQuery(userId: number, groupId: number) {
  return queryOptions({
    queryKey: groupKeys.invite(userId, groupId),
    queryFn: ({ signal }) => getGroupInvite(groupId, signal),
    staleTime: 60_000,
    retry: groupQueryRetry,
  });
}

/**
 * 신청 목록 queryOptions
 *
 * 신청은 다른 사람이 보내고 기한이 지나면 사라져서 받아 둔 목록을 믿지 않고 열 때마다 다시 받는다.
 */
export function groupApplicationsQuery(userId: number, groupId: number) {
  return queryOptions({
    queryKey: groupKeys.applications(userId, groupId),
    queryFn: ({ signal }) => getGroupApplications(groupId, signal),
    staleTime: 0,
    refetchOnWindowFocus: "always",
    retry: groupQueryRetry,
  });
}

export function blocksQuery(userId: number) {
  return queryOptions({
    queryKey: groupKeys.blocks(userId),
    queryFn: ({ signal }) => getBlocks(signal),
    staleTime: 60_000,
    retry: groupQueryRetry,
  });
}

/**
 * 공개 그룹 쪽 합치기
 *
 * 서버가 쪽마다 순서를 다시 정해 같은 그룹이 다음 쪽에 또 올 수 있어서 먼저 받은 것만 남긴다.
 */
export function dedupePublicGroups(pages: readonly PublicGroupPageResponse[]): PublicGroupCard[] {
  const seen = new Set<number>();
  const groups: PublicGroupCard[] = [];
  for (const page of pages) {
    for (const group of page.groups) {
      if (!seen.has(group.groupId)) {
        seen.add(group.groupId);
        groups.push(group);
      }
    }
  }
  return groups;
}

/**
 * 멤버가 바뀐 뒤 다시 받을 조회
 *
 * 들어가고 나가고 신청하는 일은 내 그룹 탭의 숫자, 내 신청, 공개 목록의 멤버 표시를 함께 바꾼다.
 * 그룹을 정하면 그 그룹의 공개 보기, 홈, 멤버, 신청 목록도 다시 받는다.
 * 초대코드는 내보낼 때만 바뀌어서 내보내는 화면이 따로 무효화한다.
 */
export async function invalidateGroupMembership(
  queryClient: QueryClient,
  userId: number,
  groupId?: number,
): Promise<void> {
  const keys: QueryKey[] = [
    groupKeys.mine(userId),
    groupKeys.myApplications(userId),
    groupKeys.publicLists(userId),
  ];
  if (groupId !== undefined) {
    keys.push(
      groupKeys.publicDetail(userId, groupId),
      groupKeys.home(userId, groupId),
      groupKeys.members(userId, groupId),
      groupKeys.applications(userId, groupId),
    );
  }
  await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/**
 * 떠난 그룹의 조회를 캐시에서 빼기
 *
 * 나간 그룹의 조회를 무효화하면 화면이 남아 있는 동안 다시 받아서 멤버가 아니라는 오류와 그 안내가 뜬다.
 * 그래서 그 그룹 화면을 벗어난 다음에 다시 받지 않고 캐시에서 뺀다.
 * 내 그룹 탭의 목록과 숫자는 `dropFromMyGroups`와 `invalidateGroupMembership`이 맡는다.
 */
export function forgetGroup(queryClient: QueryClient, userId: number, groupId: number): void {
  for (const queryKey of [
    groupKeys.publicDetail(userId, groupId),
    groupKeys.home(userId, groupId),
    groupKeys.members(userId, groupId),
    groupKeys.invite(userId, groupId),
    groupKeys.applications(userId, groupId),
  ]) {
    queryClient.removeQueries({ queryKey, exact: true });
  }
}

/**
 * 떠난 그룹을 받아 둔 내 그룹 목록에서 빼기
 *
 * 그룹 탭은 내 그룹을 다시 받는 동안 받아 둔 목록을 보여서, 빼지 않으면 떠난 그룹 카드와 숫자가 응답이 올 때까지 남는다.
 * 그 카드를 누르면 서버가 멤버가 아니라고 답해 막 떠난 그룹의 안내가 다시 뜬다.
 * 그룹장이던 그룹이면 그룹 만들기 한도를 세는 그룹장 그룹 수도 하나 줄인다.
 * 서버에서 새로 받은 목록이 아니라서 받은 시각은 그대로 두고, 다시 받는 일은 `invalidateGroupMembership`이 맡는다.
 */
export function dropFromMyGroups(queryClient: QueryClient, userId: number, groupId: number): void {
  const queryKey = groupKeys.mine(userId);
  const mine = queryClient.getQueryData<MyGroupsResponse>(queryKey);
  const left = mine?.groups.find((group) => group.groupId === groupId);
  if (mine === undefined || left === undefined) {
    return;
  }
  queryClient.setQueryData<MyGroupsResponse>(
    queryKey,
    {
      ...mine,
      groups: mine.groups.filter((group) => group !== left),
      ownedGroupCount: left.owner ? Math.max(0, mine.ownedGroupCount - 1) : mine.ownedGroupCount,
    },
    { updatedAt: queryClient.getQueryState(queryKey)?.dataUpdatedAt },
  );
}
