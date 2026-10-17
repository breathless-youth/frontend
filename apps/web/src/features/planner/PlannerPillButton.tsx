import { IconPlanner } from "@/features/records/icons";
import { cn } from "@/lib/utils";

import { type PlannerEntry, useOpenPlanner } from "./useOpenPlanner";

/**
 * 홈과 기록 탭 머리 오른쪽의 플래너 알약.
 * 두 탭이 같은 입구로 보이도록 모양을 한 곳에서 정한다.
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
  return (
    <button
      type="button"
      onClick={() => openPlanner(dateKey)}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-muted pr-3 pl-2.5 text-[13px] leading-4 font-semibold text-foreground shadow-[0_2px_10px_0_rgba(15,23,42,0.06)]",
        className,
      )}
    >
      <IconPlanner size={18} />
      플래너
    </button>
  );
}
