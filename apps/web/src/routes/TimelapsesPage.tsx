import { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import type { TimelapseStore } from "@/features/timelapse/timelapseStore";
import { getTimelapseStore } from "@/features/timelapse/timelapseStore";
import { TimelapsesContent } from "@/features/timelapse/TimelapsesContent";
import { slideNavigate } from "@/lib/pageTransition";

/**
 * 타임랩스 전체 목록 화면
 *
 * 기록 탭 머리의 타임랩스 버튼으로 열린다.
 */
export function TimelapsesPage({ store = getTimelapseStore() }: { store?: TimelapseStore }) {
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  const goBack = () => {
    slideNavigate("back", () => {
      const historyState = window.history.state as { idx?: number } | null;
      if (historyState?.idx) {
        navigate(-1);
        return;
      }
      // 딥링크로 곧장 열렸다 — 이 화면을 여는 홈으로 돌려보낸다.
      navigate({ pathname: "/home", search: location.search }, { replace: true });
    });
  };

  return (
    <main
      ref={mainRef}
      className="theme-soft-blue bg-soft-blue page-column text-foreground min-h-dvh pb-10"
    >
      <ScreenBackHeader title="최근 타임랩스" onBack={goBack} />
      <TimelapsesContent store={store} scopeRef={mainRef} className="px-5 pt-2" />
    </main>
  );
}
