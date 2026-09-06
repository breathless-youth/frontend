import { queryOptions } from "@tanstack/react-query";

import { getProfile } from "./profileApi";

/**
 * 프로필 queryOptions
 */
export const profileKeys = {
  all: ["profile"] as const,
  detail: (userId: number) => ["profile", userId] as const,
};

/** 프로필은 사용자가 설정에서 저장할 때만 바뀌고, 저장은 setQueryData로 바로 반영된다. */
const PROFILE_STALE_TIME_MS = 5 * 60 * 1000;

export function profileQuery(userId: number) {
  return queryOptions({
    queryKey: profileKeys.detail(userId),
    queryFn: () => getProfile(userId),
    staleTime: PROFILE_STALE_TIME_MS,
  });
}
