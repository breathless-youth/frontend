import { formatDuration } from "@/features/records/recordsFormat";

import { Skeleton } from "@/components/ui/Skeleton";
import { Separator } from "@/components/ui/separator";

/**
 * 플래너 헤더
 */
export function PlannerHead({
  dday,
  totals,
}: {
  /** D-Day: 설정돼 있을 때만 표시 */
  dday: { label: string; title: string } | null;
  totals: { focusSec: number; studySec: number } | "pending" | "error";
}) {
  return (
    <>
      <div className="flex items-start justify-between pt-1 pb-3">
        {dday !== null && (
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-xl leading-6 font-extrabold text-primary tabular-nums">
              {dday.label}
            </p>
            <p className="truncate text-xs leading-3.5 text-muted-foreground">{dday.title}</p>
          </div>
        )}

        <div className="ml-auto flex shrink-0 flex-col items-end gap-0.5">
          <p className="text-xs leading-3.5 text-muted-foreground">순공시간</p>
          {totals === "pending" ? (
            <Skeleton className="h-6 w-24 rounded-md" />
          ) : (
            <p className="text-xl leading-6 font-extrabold text-foreground tabular-nums">
              {totals === "error" ? "—" : formatDuration(totals.focusSec)}
            </p>
          )}
          <p className="text-xs leading-3.5 text-muted-foreground tabular-nums">
            총 {totals === "pending" || totals === "error" ? "—" : formatDuration(totals.studySec)}
          </p>
        </div>
      </div>
      <Separator />
    </>
  );
}
