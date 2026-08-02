import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { trackPageView } from "@/lib/analytics";

/**
 * 라우트가 바뀔 때마다 GA4 page_view를 보낸다. UI를 렌더하지 않는다.
 * StrictMode 개발 모드에서는 이펙트가 두 번 돌지만, 로컬에는 측정 ID가
 * 없어 no-op이므로 실집계에 영향 없다.
 */
export function AnalyticsRouteTracker() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    trackPageView(pathname + search);
  }, [pathname, search]);

  return null;
}
