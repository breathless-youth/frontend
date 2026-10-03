import { queryOptions } from "@tanstack/react-query";

import { getDday } from "./ddayApi";

export const ddayKeys = {
  all: ["dday"] as const,
  detail: (userId: number) => ["dday", userId] as const,
};

/** D-Day는 사용자가 시트에서 저장할 때만 바뀌고, 저장·삭제는 setQueryData로 바로 반영된다. */
const DDAY_STALE_TIME_MS = 5 * 60 * 1000;

export function ddayQuery(userId: number) {
  return queryOptions({
    queryKey: ddayKeys.detail(userId),
    queryFn: () => getDday(),
    staleTime: DDAY_STALE_TIME_MS,
  });
}
