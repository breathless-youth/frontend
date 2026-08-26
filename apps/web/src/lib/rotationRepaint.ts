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
 * 2연발(80ms·350ms)인 이유: iOS는 orientationchange 시점에 레이아웃이 정착 전이라
 * 즉시 그리면 헛발이 될 수 있는데, 350ms 단발은 백지가 걷히는 체감이 늦었다
 * (2026-08-26 피드백). 대부분의 기기에서 회전 전환이 끝나 있는 80ms에 먼저 그리고,
 * 아직이었을 경우를 350ms 백업이 잡는다 — 재커밋은 멱등이라 두 번 그려도 무해하다.
 */
const NUDGE_DELAYS_MS = [80, 350] as const;

export function useRotationRepaintNudge(): void {
  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    const repaint = () => {
      const body = document.body;
      body.style.display = "none";
      // 강제 리플로우 — none이 실제로 커밋돼야 복원이 "다시 그리기"가 된다.
      void body.offsetHeight;
      body.style.display = "";
      for (const video of document.querySelectorAll("video")) {
        kickVideoPlayback(video);
      }
    };
    const nudge = () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers = NUDGE_DELAYS_MS.map((delay) => setTimeout(repaint, delay));
    };
    window.addEventListener("orientationchange", nudge);
    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      document.body.style.display = "";
      window.removeEventListener("orientationchange", nudge);
    };
  }, []);
}
