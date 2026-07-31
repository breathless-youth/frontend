import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

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
};

export function ScreenBackHeader({ title }: ScreenBackHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex h-[52px] items-center px-2">
      {/* 아이콘뿐이라 라벨을 반드시 붙인다 — 아이콘만으로는 스크린리더가 읽지 못한다. */}
      <button
        type="button"
        onClick={() => {
          const historyState = window.history.state as { idx?: number } | null;
          if (historyState?.idx) {
            navigate(-1);
            return;
          }
          // 딥링크로 곧장 열렸을 때의 대비 — 스택이 비어 있으면 설정 탭으로 보낸다.
          navigate("/settings", { replace: true });
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
