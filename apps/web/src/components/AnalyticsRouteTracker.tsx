import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { trackPageView } from "@/lib/analytics";
import { setAmplitudeUserId, trackAmplitudePageView } from "@/lib/amplitude";
import { parseUserId } from "@/lib/userId";

/**
 * 라우트가 바뀔 때마다 GA4·Amplitude 페이지뷰를 보내고, Amplitude에는 서버 DB의 user_id도
 * 함께 연결한다. UI를 렌더하지 않는다.
 *
 * 신원 연결을 여기서 하는 이유: 셸이 **모든 탭**에 `?userId=N`을 붙이므로 라우트 변경이
 * userId를 다시 확인하기에 가장 이른 공통 지점이고, 화면마다 흩어 놓으면 한 화면만
 * 빠뜨렸을 때 그 화면 이벤트가 조용히 익명으로 남는다.
 *
 * ⚠️ **순서를 바꾸지 말 것** — `setAmplitudeUserId`가 페이지뷰 전송보다 먼저다. 뒤로 가면
 * 앱 진입 직후 첫 페이지뷰가 익명 device_id로 잡혀 유입 퍼널의 첫 칸이 어긋난다.
 *
 * GA4에는 user_id를 보내지 않는다(`analytics.ts`의 정제 원칙 유지) — 식별자 연결은
 * Amplitude 한 곳으로만 한다.
 *
 * StrictMode 개발 모드에서는 이펙트가 두 번 돌지만, 로컬에는 측정 ID·API 키가
 * 없어 no-op이므로 실집계에 영향 없다.
 */
export function AnalyticsRouteTracker() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    setAmplitudeUserId(parseUserId(new URLSearchParams(search).get("userId")));
    trackPageView(pathname, search);
    trackAmplitudePageView(pathname, search);
  }, [pathname, search]);

  return null;
}
