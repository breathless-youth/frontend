import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { trackPageView } from "@/lib/analytics";
import { trackAmplitudePageView } from "@/lib/amplitude";

/**
 * 라우트가 바뀔 때마다 GA4·Amplitude 페이지뷰를 보낸다. UI를 렌더하지 않는다.
 * StrictMode 개발 모드에서는 이펙트가 두 번 돌지만, 로컬에는 측정 ID·API 키가
 * 없어 no-op이므로 실집계에 영향 없다.
 */
export function AnalyticsRouteTracker() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    trackPageView(pathname, search);
    trackAmplitudePageView(pathname, search);
  }, [pathname, search]);

  return null;
}
