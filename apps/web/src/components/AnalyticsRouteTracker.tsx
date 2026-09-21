import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { trackPageView } from "@/lib/analytics";
import {
  consumeStudyResultExit,
  setAmplitudeUserId,
  trackAmplitudePageView,
} from "@/lib/amplitude";
import { useUserId } from "@/lib/userId";

/**
 * 라우트가 바뀔 때마다 GA4·Amplitude 페이지뷰를 보내고, Amplitude에는 서버 DB의 user_id도
 * 함께 연결한다. UI를 렌더하지 않는다.
 *
 * 신원 연결을 여기서 하는 이유: 탭 웹뷰 넷이 모두 이 컴포넌트를 거치므로 신원을 붙이기에
 * 가장 이른 공통 지점이고, 화면마다 흩어 놓으면 한 화면만 빠뜨렸을 때 그 화면 이벤트가
 * 조용히 익명으로 남는다.
 *
 * ⚠️ **신원을 `readUserId`로 읽지 말 것** — 셸이 `?userId=N`을 붙이던 시절에는 마운트
 * 시점에 값이 이미 URL에 있었지만(BY-528에서 제거), 지금 신원은 브리지 왕복 뒤에 온다.
 * 한 번 읽고 마는 방식은 그 도착을 놓쳐, 라우트를 바꾸지 않는 탭이 끝까지 익명으로 남는다.
 * `useUserId`의 구독만이 도착 시 다시 붙여 준다.
 *
 * ⚠️ **두 이펙트를 합치지 말 것** — 신원 쪽에 `pathname`·`search`를 넣거나 페이지뷰 쪽에
 * `userId`를 넣으면, 신원이 늦게 도착할 때 같은 페이지뷰가 두 번 나간다. 선언 순서가 실행
 * 순서라 마운트에서는 신원이 여전히 페이지뷰보다 먼저다(익명 첫 페이지뷰 방지).
 *
 * GA4에는 user_id를 보내지 않는다(`analytics.ts`의 정제 원칙 유지) — 식별자 연결은
 * Amplitude 한 곳으로만 한다.
 *
 * StrictMode 개발 모드에서는 이펙트가 두 번 돌지만, 로컬에는 측정 ID·API 키가
 * 없어 no-op이므로 실집계에 영향 없다.
 */
export function AnalyticsRouteTracker() {
  const { pathname, search } = useLocation();
  const userId = useUserId();

  useEffect(() => {
    setAmplitudeUserId(userId);
  }, [userId]);

  useEffect(() => {
    trackPageView(pathname, search);
    trackAmplitudePageView(pathname, search);
  }, [pathname, search]);

  /**
   * 결과 화면이 남긴 이탈 예약(`stageStudyResultExit`)을 도착 화면이 소비한다. 현재 경로를 그대로
   * 넘기고, **그 경로 몫으로 예약된 것만** 나간다 — 탭 4개 웹뷰가 동시에 살아 있어 경로로
   * 거르지 않으면 서로 남의 예약을 집어간다(`lib/amplitude.ts`의 `ResultExitPath` 주석).
   *
   * 도착 시점뿐 아니라 **다시 보이게 된 순간**에도 확인한다 — 네이티브는 세션 모달이 닫혀도 아래
   * 탭 웹뷰를 다시 마운트하지 않으므로, 라우트 변경만으로는 모달 닫힘 경로를 놓친다.
   */
  useEffect(() => {
    consumeStudyResultExit(pathname);
    const onVisible = () => {
      if (document.visibilityState === "visible") consumeStudyResultExit(pathname);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [pathname]);

  return null;
}
