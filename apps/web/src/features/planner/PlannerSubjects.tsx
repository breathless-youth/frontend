import { formatDuration } from "@/features/records/recordsFormat";
import { subjectColorVar } from "@/features/records/recordsTimetable";
import { cn } from "@/lib/utils";

import type { PlannerSubjectItem } from "./subjectItems";

/**
 * 타임테이블 왼쪽 열
 *
 * 과목마다 색·이름·그날 순공을 두는 조회 전용 범례다.
 * 과목을 고르지 않고 공부한 순공은 목록 맨 아래에 `과목 없음` 행으로 따로 보인다.
 */
export function PlannerSubjects({
  items,
  unassignedFocusSec,
  studied,
}: {
  items: readonly PlannerSubjectItem[];
  unassignedFocusSec: number;
  /** 그날 공부한 기록이 있는가 — 없으면 타임테이블 범례를 두지 않는다. */
  studied: boolean;
}) {
  const hasUnassigned = unassignedFocusSec > 0;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <SubjectLegend
            key={`${item.name}-${String(item.subjectId)}`}
            name={item.name}
            color={subjectColorVar(item.colorIndex)}
            focusSec={item.focusSec}
          />
        ))}
        {hasUnassigned && (
          <SubjectLegend name="과목 없음" color="var(--primary)" focusSec={unassignedFocusSec} />
        )}
      </div>

      {/* 범례는 타임테이블의 색을 풀이한다 — 공부하지 않은 날은 칠한 칸이 없어 두지 않는다. */}
      {studied && (
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5 pt-3.5">
          <span className="flex items-center gap-1.25">
            <span aria-hidden className="size-2.5 rounded-[2px] bg-chart-rest" />
            <span className="text-[11px] leading-3.25 text-muted-foreground">휴식</span>
          </span>
          {hasUnassigned && (
            <span className="flex items-center gap-1.25">
              <span aria-hidden className="size-2.5 rounded-[2px] bg-primary" />
              <span className="text-[11px] leading-3.25 text-muted-foreground">과목 없음</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SubjectLegend({
  name,
  color,
  focusSec,
}: {
  name: string;
  color: string;
  focusSec: number;
}) {
  return (
    <section className="flex gap-2">
      <span className="flex h-5 shrink-0 items-center">
        <span aria-hidden className="size-2 rounded-[2px]" style={{ background: color }} />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="truncate text-[15px] leading-5 font-semibold text-foreground">{name}</h2>
        <span
          className={cn(
            "text-[13px] leading-4 font-semibold tabular-nums",
            focusSec > 0 ? "text-muted-foreground" : "text-text-tertiary",
          )}
        >
          {formatDuration(focusSec)}
        </span>
      </div>
    </section>
  );
}
