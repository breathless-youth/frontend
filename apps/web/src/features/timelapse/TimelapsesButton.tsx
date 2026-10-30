import { Film } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ROUND_HEADER_BUTTON_CLASS } from "@/features/planner/PlannerPillButton";
import { useNativeControl } from "@/lib/nativeControls";
import { slideNavigate } from "@/lib/pageTransition";
import { prefetchTimelapsesPage } from "@/routes/lazyRoutes";

/**
 * 기록 탭 머리 오른쪽의 타임랩스 원형 버튼
 *
 * 누르면 기기에 보관 중인 타임랩스 전체 목록을 연다.
 * 옆의 플래너 버튼과 같은 모양이고, 앱에 이 버튼 그림이 없어 앱 모드에서는 비슷한 SF Symbol로 그린다.
 */
export function TimelapsesButton() {
  const navigate = useNavigate();
  const location = useLocation();
  // react-router navigate()는 항상 push라 빠른 이중 탭에 목록이 두 장 쌓인다.
  const openedRef = useRef(false);

  useEffect(() => {
    // 슬라이드 전환이 청크를 기다리지 않게 미리 받는다.
    prefetchTimelapsesPage();
  }, []);

  const open = () => {
    if (openedRef.current) {
      return;
    }
    openedRef.current = true;
    slideNavigate("forward", () => navigate({ pathname: "/timelapses", search: location.search }));
  };
  const { ref } = useNativeControl<HTMLButtonElement>(
    {
      id: "button-timelapses",
      kind: "button",
      title: null,
      systemImage: "film",
      shape: "circle",
      disabled: false,
      accessibilityLabel: "타임랩스",
    },
    open,
  );
  return (
    <button
      ref={ref}
      type="button"
      aria-label="타임랩스"
      onClick={open}
      className={ROUND_HEADER_BUTTON_CLASS}
    >
      <Film aria-hidden size={22} />
    </button>
  );
}
