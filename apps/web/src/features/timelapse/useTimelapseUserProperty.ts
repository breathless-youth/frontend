import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { setHasTimelapseUserProperty } from "@/lib/amplitude";

import { recentTimelapsesQuery } from "./timelapseQueries";
import type { TimelapseStore } from "./timelapseStore";
import { getTimelapseStore } from "./timelapseStore";

/**
 * 푸시 타겟용 타임랩스 유무 user property
 *
 * 홈에 들어올 때마다 기기에 보관 중인 최근 목록을 읽어 맞춘다.
 * 목록을 읽으면서 보관 기간이 지난 타임랩스도 지운다.
 * 세션은 다른 웹뷰에서 끝나므로 홈 탭으로 돌아올 때 react-query 기본값으로 다시 읽는다.
 */
export function useTimelapseUserProperty(store: TimelapseStore = getTimelapseStore()): void {
  const recent = useQuery(recentTimelapsesQuery(store));
  const hasTimelapse = recent.isSuccess ? recent.data.length > 0 : undefined;
  useEffect(() => {
    if (hasTimelapse !== undefined) {
      setHasTimelapseUserProperty(hasTimelapse);
    }
  }, [hasTimelapse]);
}
