import type { StudySessionListResponse } from "@focusmakers/types";

import { formatDuration, formatFocusRate } from "./recordsFormat";
import { Timetable } from "./Timetable";
import { dayTimetable, subjectColorVar, subjectRefMap, subjectTotalsOf } from "./recordsTimetable";

/**
 * 날짜 상세 카드
 *
 * 선택일의 순공·총공부·집중률과 과목별 시간, 24시간 타임테이블을 담는다.
 * 데이터는 이미 받은 일별 응답을 집계만 한다(추가 조회 없음).
 * 계산은 recordsTimetable 순수 함수가 하고 여기서는 그리기만 한다.
 */
export function DayDetailCard({
  stats,
  dateKey,
}: {
  stats: StudySessionListResponse;
  dateKey: string;
}) {
  const subjects = subjectRefMap(stats.subjects);
  const subjectRows = subjectTotalsOf(stats.sessions);
  const slots = dayTimetable(stats.sessions, dateKey);
  const subjectSummary = subjectRows
    .map(
      (row) =>
        `${subjects.get(row.subjectId)?.name ?? "이름 없음"} ${formatDuration(row.studySec)}`,
    )
    .join(", ");

  return (
    <div className="flex gap-3.5 rounded-[20px] bg-muted px-[18px] pt-4 pb-[18px] shadow-sb-card">
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-[11px] leading-[13px] text-muted-foreground">순공 시간</p>
        <p className="pt-[3px] text-[22px] leading-[26px] font-extrabold tracking-[-0.44px] text-primary tabular-nums">
          {formatDuration(stats.totalFocusSec)}
        </p>

        <div className="flex gap-2 pt-3">
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <p className="text-[11px] leading-[13px] text-muted-foreground">총 공부</p>
            <p className="text-base leading-[19px] font-extrabold tracking-[-0.32px] text-foreground tabular-nums">
              {formatDuration(stats.totalStudySec)}
            </p>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <p className="text-[11px] leading-[13px] text-muted-foreground">집중률</p>
            <p className="text-base leading-[19px] font-extrabold tracking-[-0.32px] text-foreground tabular-nums">
              {formatFocusRate(stats.focusRate)}
            </p>
          </div>
        </div>

        <ul className="flex flex-col gap-[9px] pt-4">
          {subjectRows.map((row) => (
            <li key={row.subjectId} className="flex items-center gap-[7px]">
              <span
                className="size-[9px] shrink-0 rounded-[2.5px]"
                style={{
                  background: subjectColorVar(subjects.get(row.subjectId)?.colorIndex ?? 0),
                }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-xs leading-[15px] text-muted-foreground">
                {subjects.get(row.subjectId)?.name ?? "이름 없음"}
              </span>
              <span className="text-xs leading-[15px] font-bold text-foreground tabular-nums">
                {formatDuration(row.studySec)}
              </span>
            </li>
          ))}
          <li className="flex items-center gap-[7px]">
            <span className="size-[9px] shrink-0 rounded-[2.5px] bg-border" aria-hidden />
            <span className="min-w-0 flex-1 text-xs leading-[15px] text-muted-foreground">
              휴식
            </span>
          </li>
        </ul>
      </div>

      <Timetable
        slots={slots}
        subjects={subjects}
        label={`이 날의 24시간 공부 분포. 순공 ${formatDuration(stats.totalFocusSec)}${
          subjectSummary ? `. 과목별 ${subjectSummary}` : ""
        }`}
      />
    </div>
  );
}
