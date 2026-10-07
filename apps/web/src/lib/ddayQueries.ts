import { queryOptions } from "@tanstack/react-query";

import { getDday } from "./ddayApi";

export const ddayKeys = {
  all: ["dday"] as const,
  detail: (userId: number) => ["dday", userId] as const,
};

/**
 * D-Day 조회
 *
 * 저장·삭제는 홈 시트가 setQueryData로 바로 반영하지만 그 캐시는 홈 탭 웹뷰 안에만 있다.
 * 설정·기록 탭은 다른 웹뷰라 바뀐 사실을 모르므로, 탭이 다시 보일 때마다 새로 읽도록 바로 만료시킨다.
 */
export function ddayQuery(userId: number) {
  return queryOptions({
    queryKey: ddayKeys.detail(userId),
    queryFn: () => getDday(),
    staleTime: 0,
  });
}
