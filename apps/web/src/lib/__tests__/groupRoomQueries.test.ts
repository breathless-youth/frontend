import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api";
import * as groupRoomApi from "../groupRoomApi";
import {
  blocksQuery,
  dedupePublicGroups,
  groupApplicationsQuery,
  groupHomeQuery,
  groupInviteQuery,
  groupKeys,
  groupMembersQuery,
  groupQueryRetry,
  invalidateGroupMembership,
  myApplicationsQuery,
  myGroupsQuery,
  publicGroupQuery,
  publicGroupsQuery,
} from "../groupRoomQueries";

vi.mock("../groupRoomApi");

const card = (groupId: number) => ({
  groupId,
  name: `그룹${groupId}`,
  category: "CSAT" as const,
  memberCount: 3,
  weeklyAverageFocusSec: 0,
  studyingCount: 0,
  member: false,
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("groupRoomQueries", () => {
  it("모든 키에 사용자 번호가 들어간다", () => {
    expect(groupKeys.home(7, 10)).toEqual(["groups", 7, "home", 10]);
    expect(groupKeys.publicList(7, { query: "공시", category: null })).toEqual([
      "groups",
      7,
      "public-list",
      "공시",
      "all",
    ]);
    expect(groupKeys.blocks(7)).toEqual(["blocks", 7]);
  });

  it("내 그룹 탭과 그룹 홈은 보이는 동안 30초마다 다시 받는다", () => {
    for (const options of [myGroupsQuery(7), groupHomeQuery(7, 10)]) {
      expect(options).toMatchObject({
        staleTime: 10_000,
        refetchInterval: 30_000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: "always",
      });
    }
  });

  it("다음 쪽은 서버가 있다고 할 때만 받는다", () => {
    const options = publicGroupsQuery(7, { query: "", category: null });
    const page = { groups: [card(1)], hasNext: true };
    expect(options.getNextPageParam(page, [page], 0, [0])).toBe(1);
    expect(
      options.getNextPageParam({ ...page, hasNext: false }, [page, page], 1, [0, 1]),
    ).toBeUndefined();
  });

  it("쪽을 합칠 때 같은 그룹은 먼저 받은 것만 남긴다", () => {
    expect(
      dedupePublicGroups([
        { groups: [card(1), card(2)], hasNext: true },
        { groups: [card(2), card(3)], hasNext: false },
      ]).map((group) => group.groupId),
    ).toEqual([1, 2, 3]);
  });

  it("4xx는 다시 시도하지 않는다", () => {
    expect(groupQueryRetry(0, new ApiError("x", 403, "NOT_GROUP_MEMBER"))).toBe(false);
    expect(groupQueryRetry(0, new ApiError("x", 500))).toBe(true);
    expect(groupQueryRetry(1, new TypeError("network"))).toBe(false);
  });

  it("멤버 변화는 내 그룹, 내 신청, 공개 목록과 그 그룹 조회를 무효화한다", async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    await invalidateGroupMembership(client, 7, 10);
    const keys = spy.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        groupKeys.mine(7),
        groupKeys.myApplications(7),
        groupKeys.publicLists(7),
        groupKeys.home(7, 10),
        groupKeys.publicDetail(7, 10),
      ]),
    );
  });

  it("그룹을 정하지 않은 멤버 변화는 그룹마다 받는 조회를 건드리지 않는다", async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    await invalidateGroupMembership(client, 7);
    expect(spy.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      groupKeys.mine(7),
      groupKeys.myApplications(7),
      groupKeys.publicLists(7),
    ]);
  });

  it("공개 목록 무효화는 검색어와 시험·목표가 다른 목록까지 모두 닿는다", async () => {
    const client = new QueryClient();
    client.setQueryData(groupKeys.publicList(7, { query: "공시", category: "CSAT" }), {});
    client.setQueryData(groupKeys.publicList(7, { query: "", category: null }), {});
    await invalidateGroupMembership(client, 7);
    const lists = client.getQueryCache().findAll({ queryKey: groupKeys.publicLists(7) });
    expect(lists).toHaveLength(2);
    expect(lists.every((query) => query.state.isInvalidated)).toBe(true);
  });

  it.each([
    ["내 그룹", (c: QueryClient) => c.fetchQuery(myGroupsQuery(7)), "getMyGroups", []],
    ["내 신청", (c: QueryClient) => c.fetchQuery(myApplicationsQuery(7)), "getMyApplications", []],
    [
      "공개 그룹 보기",
      (c: QueryClient) => c.fetchQuery(publicGroupQuery(7, 12)),
      "getPublicGroup",
      [12],
    ],
    ["그룹 홈", (c: QueryClient) => c.fetchQuery(groupHomeQuery(7, 10)), "getGroupHome", [10]],
    [
      "멤버 목록",
      (c: QueryClient) => c.fetchQuery(groupMembersQuery(7, 10)),
      "getGroupMembers",
      [10],
    ],
    ["초대코드", (c: QueryClient) => c.fetchQuery(groupInviteQuery(7, 11)), "getGroupInvite", [11]],
    [
      "신청 목록",
      (c: QueryClient) => c.fetchQuery(groupApplicationsQuery(7, 10)),
      "getGroupApplications",
      [10],
    ],
    ["차단 목록", (c: QueryClient) => c.fetchQuery(blocksQuery(7)), "getBlocks", []],
  ] as const)("%s 조회는 그 API에 취소 신호를 함께 넘긴다", async (_name, fetch, api, args) => {
    vi.mocked(groupRoomApi[api]).mockResolvedValue({} as never);
    await fetch(new QueryClient());
    expect(groupRoomApi[api]).toHaveBeenCalledWith(...args, expect.any(AbortSignal));
  });

  it("공개 목록은 검색 조건과 쪽 번호, 20개 크기로 받는다", async () => {
    vi.mocked(groupRoomApi.getPublicGroups).mockResolvedValue({ groups: [], hasNext: false });
    await new QueryClient().fetchInfiniteQuery(
      publicGroupsQuery(7, { query: "공시", category: "CIVIL_SERVICE" }),
    );
    expect(groupRoomApi.getPublicGroups).toHaveBeenCalledWith(
      { query: "공시", category: "CIVIL_SERVICE", page: 0, size: 20 },
      expect.any(AbortSignal),
    );
  });

  it("그룹 조회는 모두 같은 재시도 규칙을 쓴다", () => {
    const all = [
      myGroupsQuery(7),
      myApplicationsQuery(7),
      publicGroupsQuery(7, { query: "", category: null }),
      publicGroupQuery(7, 12),
      groupHomeQuery(7, 10),
      groupMembersQuery(7, 10),
      groupInviteQuery(7, 11),
      groupApplicationsQuery(7, 10),
      blocksQuery(7),
    ];
    expect(all.every((options) => options.retry === groupQueryRetry)).toBe(true);
  });

  it("신청 목록은 늘 오래된 것으로 보고 돌아오면 바로 다시 받는다", () => {
    expect(groupApplicationsQuery(7, 10)).toMatchObject({
      staleTime: 0,
      refetchOnWindowFocus: "always",
    });
  });
});
