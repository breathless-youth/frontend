import { queryOptions } from "@tanstack/react-query";

import { getActiveNotices } from "./noticeApi";

/**
 * 공지 queryOptions
 *
 * 서버가 부를 때마다 그룹을 다시 판정하므로 캐시를 신선하다고 보지 않는다.
 */
export const noticeKeys = {
  all: ["notices"] as const,
  active: (userId: number) => ["notices", "active", userId] as const,
};

export function activeNoticesQuery(userId: number) {
  return queryOptions({
    queryKey: noticeKeys.active(userId),
    queryFn: () => getActiveNotices(),
    staleTime: 0,
  });
}
