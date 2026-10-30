import { IconPlanner } from "@/features/records/icons";
import { useNativeControl } from "@/lib/nativeControls";
import { cn } from "@/lib/utils";

import { type PlannerEntry, useOpenPlanner } from "./useOpenPlanner";

/** 기록 탭 머리 오른쪽 원형 버튼들이 같이 쓰는 모양. */
export const ROUND_HEADER_BUTTON_CLASS =
  "flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground shadow-[0_2px_10px_0_rgba(15,23,42,0.06)]";

/**
 * 기록 탭 머리 오른쪽의 타임테이블 원형 버튼.
 * 보이는 이름은 타임테이블이고 코드와 그림 이름은 예전 이름인 플래너를 쓴다.
 * 옆의 타임랩스 버튼과 같은 모양이라 모양을 한 곳에서 정한다.
 * 놓이는 줄마다 맞춤이 달라 `className`으로 여백·정렬만 받는다.
 */
export function PlannerPillButton({
  via,
  dateKey,
  className,
}: {
  via: PlannerEntry;
  dateKey?: string;
  className?: string;
}) {
  const openPlanner = useOpenPlanner(via);
  const open = () => {
    openPlanner(dateKey);
  };
  // 앱 원형 버튼은 웹 아이콘을 렌더해 앱에 넣은 이미지로 같은 그림을 그린다.
  // 그 이미지가 없는 이전 앱은 비슷한 SF Symbol로 그린다.
  const { ref } = useNativeControl<HTMLButtonElement>(
    {
      id: `button-planner-${via}`,
      kind: "button",
      title: null,
      systemImage: "calendar",
      image: "planner",
      shape: "circle",
      disabled: false,
      accessibilityLabel: "타임테이블",
    },
    open,
  );
  return (
    <button
      ref={ref}
      type="button"
      aria-label="타임테이블"
      onClick={open}
      className={cn(ROUND_HEADER_BUTTON_CLASS, className)}
    >
      <IconPlanner size={24} />
    </button>
  );
}
