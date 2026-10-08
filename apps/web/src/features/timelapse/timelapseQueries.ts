import { queryOptions } from "@tanstack/react-query";

import type { TimelapseStore } from "./timelapseStore";

/** 홈 목록과 전체 목록이 함께 쓰는 키. 둘 다 홈 탭 웹뷰 안이라 캐시도 같다. */
export const recentTimelapsesKey = ["timelapse", "recent"] as const;

/** 보관 중인 타임랩스를 최신부터 읽는다. */
export function recentTimelapsesQuery(store: TimelapseStore) {
  return queryOptions({
    queryKey: recentTimelapsesKey,
    queryFn: async () => {
      // 세션을 오래 안 하면 지울 기회가 없어 목록을 열 때도 보관 기한을 적용한다.
      // 정리는 부가 동작이라 실패해도 목록은 읽는다.
      await store.sweep(Date.now()).catch(() => {});
      return await store.listReady();
    },
  });
}
