import type { SubjectRef } from "@focusmakers/types";

import { formatDuration } from "@/features/records/recordsFormat";
import { subjectColorVar } from "@/features/records/recordsTimetable";

import {
  PLANNER_CELLS_PER_ROW,
  plannerCellFills,
  plannerHours,
  type PlannerCellFill,
  type PlannerDay,
} from "./plannerDay";

const HOURS = plannerHours();

function fillStyle(fill: PlannerCellFill, subjects: ReadonlyMap<number, SubjectRef>) {
  const position = { left: `${String(fill.left * 100)}%`, width: `${String(fill.width * 100)}%` };
  if (fill.paint.kind !== "subject") {
    return position;
  }
  const subject = subjects.get(fill.paint.subjectId);
  // 응답에 없는 과목 id는 엉뚱한 과목 색 대신 기본 집중색으로 둔다.
  return subject === undefined
    ? { ...position, background: "var(--color-primary)" }
    : { ...position, background: subjectColorVar(subject.colorIndex) };
}

/**
 * 플래너 타임테이블 — 5시에서 시작해 다음 날 4시에서 끝나는 24행, 한 행은 10분 칸 6개.
 *
 * 칸 안은 실제 시작·종료 시각대로 나눠 칠한다(칸 단위로 반올림하지 않는다). 과목을 고르고 공부한
 * 순공은 과목 색, 과목 없이 공부한 순공은 기본 집중색, 순공이 아닌 시간은 휴식색이다.
 */
export function PlannerTimetable({ day }: { day: PlannerDay }) {
  const cells = plannerCellFills(day);

  return (
    <div
      role="img"
      aria-label={`이 날의 시간대별 공부 분포. 순공 ${formatDuration(day.focusSec)}`}
      className="flex w-[160px] shrink-0 flex-col gap-px"
    >
      {HOURS.map((hour, row) => (
        <div key={hour} className="flex items-center gap-[3px]">
          <span
            aria-hidden
            // 자정을 넘긴 0~4시는 다음 날이라 흐리게 적는다.
            className={`w-4 shrink-0 text-right text-[10px] leading-[13px] tabular-nums ${
              hour < 5 ? "text-text-tertiary" : "text-muted-foreground"
            }`}
          >
            {hour}
          </span>
          {Array.from({ length: PLANNER_CELLS_PER_ROW }, (_, column) => {
            const fills = cells[row * PLANNER_CELLS_PER_ROW + column] ?? [];
            return (
              <span
                key={column}
                className="relative h-[13px] min-w-0 flex-1 overflow-hidden rounded-[2px] bg-chart-empty"
              >
                {fills.map((fill, index) => (
                  <span
                    key={index}
                    data-paint={fill.paint.kind}
                    className={`absolute inset-y-0 ${
                      fill.paint.kind === "rest"
                        ? "bg-chart-rest"
                        : fill.paint.kind === "focus"
                          ? "bg-primary"
                          : ""
                    }`}
                    style={fillStyle(fill, day.subjects)}
                  />
                ))}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
