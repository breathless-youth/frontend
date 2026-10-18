import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { trackScreenBackPressed } from "@/lib/amplitude";
import { slideNavigate } from "@/lib/pageTransition";
import { sanitizePagePath } from "@/lib/sanitizePath";

/**
 * 탭 바 없는 전체 화면 라우트의 상단 바 (웹 버전)
 */
type ScreenBackHeaderProps = {
  title?: string;
  onBack?: () => void;
  /** 바 높이를 44px로 줄인다 — 제목 줄이 바 안에 있거나 본문이 바로 아래에서 시작하는 화면(플래너)이 쓴다. */
  compact?: boolean;
  /**
   * 헤더 가운데의 제목
   * - 플래너의 `‹ 날짜 ›`처럼 글자가 아니라 조작까지 든 제목
   * - `title`과 함께 쓰지 않는다.
   */
  center?: ReactNode;
};

export function ScreenBackHeader({
  title,
  onBack,
  compact = false,
  center,
}: ScreenBackHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    // 상단 safe area만큼 높이를 늘리고 그만큼 패딩을 준다
    // — 이게 없으면 웹뷰가 상태 바 아래까지 그려지는 기기(노치/다이나믹 아일랜드)에서 헤더가 통째로 가려져 뒤로가기 버튼을 누를 수 없다.
    // - 앱에서는 `SafeAreaView`가 처리하던 부분이고, 홈·기록·설정 본문도 같은 규칙(`env(safe-area-inset-top)`)을 쓴다.
    <div
      className={`flex items-center px-2 pt-[env(safe-area-inset-top)] ${
        compact
          ? "h-[calc(44px+env(safe-area-inset-top))]"
          : "h-[calc(52px+env(safe-area-inset-top))]"
      }`}
    >
      {/* 아이콘뿐이라 라벨을 반드시 붙인다 — 아이콘만으로는 스크린리더가 읽지 못한다. */}
      <button
        type="button"
        onClick={() => {
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
            // 딥링크로 곧장 열렸을 때의 대비 — 스택이 비어 있으면 설정 탭으로 보낸다.
            navigate("/settings", { replace: true });
          });
        }}
        aria-label="뒤로 가기"
        className="flex size-11 items-center justify-center"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>

      {title !== undefined && (
        <h1 className="shrink truncate text-[17px] leading-5.25 font-semibold text-foreground">
          {title}
        </h1>
      )}
      {center !== undefined && (
        <>
          <div className="flex min-w-0 flex-1 justify-center">{center}</div>
          <div aria-hidden className="size-11 shrink-0" />
        </>
      )}
    </div>
  );
}
