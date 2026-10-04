import { Check } from "lucide-react";

import { formatDuration } from "@/features/records/recordsFormat";
import { subjectColorVar } from "@/features/records/recordsTimetable";

import type { PlannerSubjectItem } from "./subjectItems";

/**
 * 플래너 왼쪽 열 — 과목마다 색·이름·그날 순공시간, 그 아래 할 일.
 *
 * 그날 완료한 할 일은 체크된 채 과목 아래에 보인다. 과목을 고르지 않고 공부한 순공은 목록 맨 아래에
 * `과목 없이 공부` 행으로 따로 보인다(과목이 하나도 없으면 그 행이 맨 위다).
 */
export function PlannerSubjects({
  items,
  unassignedFocusSec,
  emptyMessage,
}: {
  items: readonly PlannerSubjectItem[];
  unassignedFocusSec: number;
  /** 과목도 과목 없는 순공도 없을 때 보여 줄 문구(여러 줄). */
  emptyMessage: readonly string[];
}) {
  const hasUnassigned = unassignedFocusSec > 0;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      {items.length === 0 && !hasUnassigned && (
        <p className="pt-1 text-[13px] leading-[19px] text-muted-foreground">
          {emptyMessage.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>
      )}

      {items.map((item) => (
        <section key={`${item.name}-${String(item.subjectId)}`} className="flex flex-col gap-[5px]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden
                className="h-3.5 w-[3px] shrink-0 rounded-[2px]"
                style={{ background: subjectColorVar(item.colorIndex) }}
              />
              <span className="truncate text-sm leading-[18px] font-bold text-foreground">
                {item.name}
              </span>
            </h2>
            <span className="shrink-0 text-[12.5px] leading-4 font-medium text-muted-foreground tabular-nums">
              {formatDuration(item.focusSec)}
            </span>
          </div>
          {item.tasks.length > 0 && (
            <ul className="flex flex-col gap-[5px]">
              {item.tasks.map((task) => (
                <li key={task.id} className="flex items-center gap-2 py-0.5 pl-[9px]">
                  <span
                    role="img"
                    aria-label={task.done ? "완료" : "미완료"}
                    className={`flex size-[18px] shrink-0 items-center justify-center rounded-full ${
                      task.done ? "bg-primary" : "border-[1.5px] border-text-tertiary"
                    }`}
                  >
                    {task.done && (
                      <Check
                        size={11}
                        strokeWidth={3}
                        className="text-primary-foreground"
                        aria-hidden
                      />
                    )}
                  </span>
                  <span
                    className={`min-w-0 flex-1 text-[13px] leading-[17px] ${
                      task.done ? "text-text-tertiary" : "text-foreground"
                    }`}
                  >
                    {task.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {hasUnassigned && (
        <section className="flex flex-col gap-[3px]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden className="h-3.5 w-[3px] shrink-0 rounded-[2px] bg-primary" />
              <span className="truncate text-sm leading-[18px] font-bold text-foreground">
                과목 없이 공부
              </span>
            </h2>
            <span className="shrink-0 text-[12.5px] leading-4 font-medium text-muted-foreground tabular-nums">
              {formatDuration(unassignedFocusSec)}
            </span>
          </div>
          <p className="pl-[9px] text-[11px] leading-[14px] text-text-tertiary">
            세션에서 과목을 고르지 않은 시간이에요
          </p>
        </section>
      )}

      <div className="flex items-center gap-3 pt-0.5">
        <span className="flex items-center gap-[5px]">
          <span aria-hidden className="size-2.5 rounded-[3px] bg-chart-rest" />
          <span className="text-[11px] leading-[14px] text-muted-foreground">휴식</span>
        </span>
        {hasUnassigned && (
          <span className="flex items-center gap-[5px]">
            <span aria-hidden className="size-2.5 rounded-[3px] bg-primary" />
            <span className="text-[11px] leading-[14px] text-muted-foreground">과목 없음</span>
          </span>
        )}
      </div>
    </div>
  );
}
