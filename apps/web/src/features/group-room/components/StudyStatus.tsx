import { cn } from "@/lib/utils";

import { studyingCountText } from "../model/desks";

/**
 * 지금 공부 중인 사람 수 줄
 *
 * 점 색만으로 알리지 않도록 문장을 함께 두고, 점은 화면 낭독기에서 뺀다.
 */
export function StudyStatus({ count }: { count: number }) {
  const studying = count > 0;
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          studying && "bg-feedback-success",
          !studying && "bg-text-disabled",
        )}
      />
      <span
        className={cn(
          "text-[13px] leading-5",
          studying && "text-foreground",
          !studying && "text-muted-foreground",
        )}
      >
        {studyingCountText(count)}
      </span>
    </span>
  );
}
