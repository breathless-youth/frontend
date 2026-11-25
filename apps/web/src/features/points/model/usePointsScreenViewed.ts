import { useEffect } from "react";

import { trackPointsScreenViewed } from "@/lib/amplitude";

/** 포인트 화면을 열 때마다 한 번, 탭처럼 같은 화면에서 값이 바뀔 때도 한 번 열람을 보낸다. */
export function usePointsScreenViewed(screen: Parameters<typeof trackPointsScreenViewed>[0]) {
  useEffect(() => {
    trackPointsScreenViewed(screen);
  }, [screen]);
}
