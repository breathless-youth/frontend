import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { GlassChrome } from "@/components/GlassChrome";
import { trackScreenBackPressed } from "@/lib/amplitude";
import { slideNavigate } from "@/lib/pageTransition";
import { sanitizePagePath } from "@/lib/sanitizePath";

/**
 * 탭 바 없는 전체 화면 라우트의 상단 바 (웹 버전)
 */
type ScreenBackHeaderProps = {
  title?: string;
  onBack?: () => void;
  /**
   * 제목 대신 가운데에 두는 웹 요소
   *
   * 플래너의 `‹ 날짜 ›`처럼 글자가 아니라 조작까지 든 제목이다.
   * `title`과 함께 쓰지 않는다.
   */
  center?: ReactNode;
};

export function ScreenBackHeader({ title, onBack, center }: ScreenBackHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <GlassChrome
      top={{
        leading: "back",
        title,
        center,
        onLeading: () => {
          trackScreenBackPressed(sanitizePagePath(location.pathname, ""));
          if (onBack) {
            onBack();
            return;
          }
          slideNavigate("back", () => {
            const historyState = window.history.state as { idx?: number } | null;
            if (historyState?.idx) {
              navigate(-1);
              return;
            }
            // 딥링크로 곧장 열렸을 때의 대비다. 스택이 비어 있으면 설정 탭으로 보낸다.
            navigate("/settings", { replace: true });
          });
        },
      }}
    />
  );
}
