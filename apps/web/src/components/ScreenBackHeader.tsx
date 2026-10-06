import { ChevronLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { trackScreenBackPressed } from "@/lib/amplitude";
import { slideNavigate } from "@/lib/pageTransition";
import { sanitizePagePath } from "@/lib/sanitizePath";

/**
 * 탭 바 없는 전체 화면 라우트(`/terms`·`/privacy`·`/contact`)의 상단 바.
 *
 * RN 원본(`apps/mobile/components/ScreenBackHeader.tsx`)의 웹 이식. 원본의 `router.canGoBack()`
 * 폴백을 그대로 옮긴다 — 딥링크·새로고침으로 곧장 열렸을 때의 대비다. 이 경우 `window.history.state.idx`가
 * 0(또는 없음)이라 `navigate(-1)`이 SPA 밖으로 나가거나 무동작하므로 `/settings`로 보낸다.
 */
type ScreenBackHeaderProps = {
  /**
   * 상단 바에 표시할 제목. 본문이 자기 제목을 크게 그리는 화면(법적 문서)은 넘기지 않는다 —
   * 같은 제목이 두 번 읽히면 스크린리더에서 중복된다.
   */
  title?: string;
  /**
   * 뒤로 가기 동작 재정의. 기본 동작(`history.state.idx` 검사 + SPA `navigate`)은 SPA로
   * 진입한 라우트 전제라, **문서 단위 내비게이션으로 진입하는 라우트(`/contact`·`/interview`)는 자기
   * 규칙을 넘겨야 한다** — 하드 내비게이션 직후에는 BrowserRouter가 새 문서에 `idx: 0`을
   * 심어 기본 동작이 항상 딥링크로 오판하고, SPA 폴백 이동은 그 문서의 헤더 정책(COEP
   * 없음)을 다음 라우트까지 승계시킨다(`GoogleFormPage` 주석 참고).
   */
  onBack?: () => void;
  /** 바 높이를 44px로 줄인다 — 본문이 자기 제목 줄을 바로 아래에 두는 화면(플래너)이 쓴다. */
  compact?: boolean;
};

export function ScreenBackHeader({ title, onBack, compact = false }: ScreenBackHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    // 상단 안전영역만큼 높이를 늘리고 그만큼 패딩을 준다 — 이게 없으면 웹뷰가 상태 바
    // 아래까지 그려지는 기기(노치/다이나믹 아일랜드)에서 헤더가 통째로 가려져 **뒤로가기
    // 버튼을 누를 수 없다**(2026-08-01 iPhone 13 mini 확인). RN 원본은 `SafeAreaView`가
    // 처리하던 부분이고, 홈·기록·설정 본문도 같은 규칙(`env(safe-area-inset-top)`)을 쓴다.
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
        <h1 className="shrink truncate text-[17px] leading-[21px] font-semibold text-foreground">
          {title}
        </h1>
      )}
    </div>
  );
}
