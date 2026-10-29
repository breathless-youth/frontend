import { Play } from "lucide-react";

import type { PlannerSubjectItem } from "@/features/planner/subjectItems";
import { formatDuration } from "@/features/records/recordsFormat";
import { subjectColorVar } from "@/features/records/recordsTimetable";

/**
 * 홈 과목 목록
 *
 * 과목마다 이름과 고른 날의 순공을 한 줄로 보인다.
 * 오늘은 과목 색 재생 버튼으로 공부를 시작하고, 지난 날은 같은 자리에 과목 색 막대만 둔다.
 * 지운 과목은 그날 기록에만 남아 있어 오늘이어도 시작할 수 없으므로 막대로 그린다.
 */
export function HomeSubjectList({
  items,
  isToday,
  onPlay,
}: {
  items: PlannerSubjectItem[];
  isToday: boolean;
  onPlay: (subjectId: number) => void;
}) {
  return (
    <ul aria-label="과목" className="flex flex-col gap-2.5">
      {items.map((item) => {
        const color = subjectColorVar(item.colorIndex);
        return (
          <li
            key={`${item.live ? "live" : "record"}-${item.subjectId}`}
            className="flex min-h-17 items-center gap-2 rounded-lg bg-muted py-3 pr-4 pl-3 shadow-sb-card"
          >
            {isToday && item.live ? (
              <button
                type="button"
                aria-label={`${item.name} 공부 시작`}
                onClick={() => onPlay(item.subjectId)}
                style={{ color }}
                className="flex size-11 shrink-0 items-center justify-center rounded-full"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-current/15">
                  <Play aria-hidden size={14} fill="currentColor" />
                </span>
              </button>
            ) : (
              <span aria-hidden className="flex size-11 shrink-0 items-center justify-center">
                <span className="h-5 w-1 rounded-full" style={{ backgroundColor: color }} />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-base leading-6 font-semibold text-foreground">
              {item.name}
            </span>
            <span className="flex shrink-0 flex-col items-end">
              <span className="text-[11px] leading-3.5 text-text-tertiary">순공</span>
              <span className="text-[15px] leading-5 font-bold text-foreground tabular-nums">
                {formatDuration(item.focusSec)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
