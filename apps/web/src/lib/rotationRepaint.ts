import { useEffect } from "react";

import { kickVideoPlayback } from "./videoPlayback";

/**
 * iOS WKWebView 회전 백지 방어 — 회전 직후 새 방향의 페이지를 통째로 그리지 않고
 * 순백으로 남는 일이 있다(2026-08-26 실기기: 소셜룸 가로→세로 복귀마다 재현, 반대로
 * 다시 회전해야만 복구. 세션·타이머·연결은 살아 있어 **페인트만** 죽은 상태다).
 *
 * 회전이 정착한 뒤 body를 display:none↔복원해 렌더 트리를 강제로 다시 그린다 —
 * 이미 백지인 화면이라 한 프레임의 none은 보이지 않고, display:none이 멈춘 영상은
 * 복원 직후 kickVideoPlayback으로 되살린다. transform 기반 무효화(translateZ 등)는
 * 이 저장소의 WKWebView 페인트 사고 전력(스크롤 컨테이너 transform → 타일 누락)이
 * 있어 일부러 피했다.
 *
 * 350ms 지연은 iOS가 orientationchange/resize 시점에 레이아웃이 아직 정착 전이라서다
 * (카메라 모달의 회전 재측정과 같은 근거 — LiveRoomSession의 remeasure 주석).
 */
export function useRotationRepaintNudge(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const nudge = () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        const body = document.body;
        body.style.display = "none";
        // 강제 리플로우 — none이 실제로 커밋돼야 복원이 "다시 그리기"가 된다.
        void body.offsetHeight;
        body.style.display = "";
        for (const video of document.querySelectorAll("video")) {
          kickVideoPlayback(video);
        }
      }, 350);
    };
    window.addEventListener("orientationchange", nudge);
    return () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      document.body.style.display = "";
      window.removeEventListener("orientationchange", nudge);
    };
  }, []);
}
