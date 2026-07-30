import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * 탭 바 없는 전체 화면 라우트(`/terms`·`/privacy`·`/contact`)의 상단 바.
 *
 * RN 원본(`apps/mobile/components/ScreenBackHeader.tsx`)의 웹 이식. 원본은 `router.canGoBack()`으로
 * 딥링크 직행을 방어하지만 웹은 네이티브 셸이 항상 `/settings`를 거쳐 들어오므로 `navigate(-1)`만 쓴다.
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
        onClick={() => navigate(-1)}
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
