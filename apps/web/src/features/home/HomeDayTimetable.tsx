import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import type { PlannerDay } from "@/features/planner/plannerDay";
import { PlannerSubjects } from "@/features/planner/PlannerSubjects";
import { PlannerTimetable } from "@/features/planner/PlannerTimetable";
import type { PlannerSubjectItem } from "@/features/planner/subjectItems";

/**
 * 홈 타임테이블 탭
 *
 * 지난 날 조회는 열 때마다 다시 받는 설정이라, 따로 조회하지 않고 홈이 받은 결과를 그대로 그린다.
 * 과목 목록 탭과 같은 때 기다리고 같은 오류를 보여야 두 탭이 다른 과목을 보이지 않는다.
 */
export function HomeDayTimetable({
  day,
  items,
  pending,
  onRetry,
}: {
  day: PlannerDay | null;
  items: readonly PlannerSubjectItem[];
  pending: boolean;
  /** 그날 기록을 받지 못했을 때만 있다. */
  onRetry?: () => void;
}) {
  if (onRetry !== undefined) {
    return <ErrorState message="기록을 불러오지 못했어요" onRetry={onRetry} screen="home" />;
  }
  if (pending || day === null) {
    return (
      <div className="flex gap-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Skeleton className="h-4.5 w-full rounded-md" />
          <Skeleton className="h-4.5 w-3/4 rounded-md" />
        </div>
        <Skeleton className="h-113 w-58 min-w-46 rounded-lg" />
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3.5">
      <PlannerSubjects
        items={items}
        unassignedFocusSec={day.unassignedFocusSec}
        studied={day.paints.length > 0}
      />
      <PlannerTimetable day={day} />
    </div>
  );
}
