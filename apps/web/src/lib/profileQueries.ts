import { queryOptions } from "@tanstack/react-query";

import { getProfile } from "./profileApi";

/**
 * 프로필 queryOptions
 */
export const profileKeys = {
  all: ["profile"] as const,
  detail: (userId: number) => ["profile", userId] as const,
};

export function profileQuery(userId: number) {
  return queryOptions({
    queryKey: profileKeys.detail(userId),
    queryFn: () => getProfile(userId),
  });
}
