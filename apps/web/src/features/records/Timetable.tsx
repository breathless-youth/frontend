import type { CSSProperties } from "react";

import type { SubjectRef } from "@focusmakers/types";

import { condenseTimetable, subjectColorVar, type TimetableSlot } from "./recordsTimetable";

/**
 * 24시간 타임테이블(Figma 상세 timeline)
 *
 * 2분 720칸을 시안대로 10분 6칸씩 묶어 24행 × 6칸으로 그린다.
 * 색만으로 뜻을 전하지 않도록 전체를 `role="img"`로 묶어 라벨을 준다.
 *
 * 칸 색: 과목 구간은 과목 팔레트, 과목 없이 공부한 구간은 집중색, 휴식은 연한 경계색,
 * 세션 밖은 빈 색. 값은 전부 토큰이라 라이트·다크가 자동으로 바뀐다.
 */
const CELLS_PER_ROW = 6;

function cellClass(slot: TimetableSlot): string {
  switch (slot.kind) {
    case "focus":
      return "bg-primary";
    case "rest":
      return "bg-border";
    case "subject":
      return "";
    default:
      return "bg-chart-empty";
  }
}

function cellStyle(
  slot: TimetableSlot,
  subjects: ReadonlyMap<number, SubjectRef>,
): CSSProperties | undefined {
  if (slot.kind !== "subject") {
    return undefined;
  }
  const subject = subjects.get(slot.subjectId);
  return { background: subjectColorVar(subject?.colorIndex ?? 0) };
}

export function Timetable({
  slots,
  subjects,
  label = "24시간 공부 분포",
}: {
  slots: readonly TimetableSlot[];
  subjects: ReadonlyMap<number, SubjectRef>;
  label?: string;
}) {
  const condensed = condenseTimetable(slots);
  const rows = Array.from({ length: 24 }, (_, hour) =>
    condensed.slice(hour * CELLS_PER_ROW, hour * CELLS_PER_ROW + CELLS_PER_ROW),
  );

  return (
    <div className="flex flex-1 flex-col gap-px" role="img" aria-label={label}>
      {rows.map((cells, hour) => (
        <div key={hour} className="flex items-center gap-[5px]">
          <span className="w-3.5 text-right text-[8.5px] leading-[8px] text-text-tertiary tabular-nums">
            {hour}
          </span>
          <div className="flex flex-1 gap-[2px]">
            {cells.map((slot, index) => (
              <span
                key={index}
                className={`h-2 min-w-px flex-1 rounded-[2px] ${cellClass(slot)}`}
                style={cellStyle(slot, subjects)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
