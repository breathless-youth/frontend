import { queryOptions } from "@tanstack/react-query";

import { getInterviewStatus } from "./interviewApi";

/**
 * 인터뷰 상태 queryOptions
 *
 * 방금 제출한 세션까지 반영된 값이 필요해 매번 새로 받는다.
 */
export const interviewKeys = {
  all: ["interview"] as const,
  status: (userId: number) => ["interview", "status", userId] as const,
};

export function interviewStatusQuery(userId: number) {
  return queryOptions({
    queryKey: interviewKeys.status(userId),
    queryFn: () => getInterviewStatus(),
    staleTime: 0,
  });
}
