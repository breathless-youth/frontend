import type { StudySessionSummary, SubjectRef } from "@focusmakers/types";

import {
  bundleSpan,
  manualBundles,
  readAloudLabel,
  subjectIdOf,
  subjectNameOf,
} from "@/features/manual-record/manualRecord";
import { formatDuration } from "@/features/records/recordsFormat";
import { subjectColorVar } from "@/features/records/recordsTimetable";
import { cn } from "@/lib/utils";

import {
  PLANNER_CELL_MINUTES,
  PLANNER_CELLS_PER_ROW,
  plannerCellFills,
  plannerHours,
  type PlannerCellFill,
  type PlannerDay,
} from "./plannerDay";

const HOURS = plannerHours();
const CELL_MS = PLANNER_CELL_MINUTES * 60_000;

function fillStyle(fill: PlannerCellFill, subjects: ReadonlyMap<number, SubjectRef>) {
  const position = { left: `${String(fill.left * 100)}%`, width: `${String(fill.width * 100)}%` };
  if (fill.paint.kind !== "subject") {
    return position;
  }
  const subject = subjects.get(fill.paint.subjectId);
  // 응답에 없는 과목 id는 엉뚱한 과목 색 대신 기본 집중색으로 둔다.
  const color = subject === undefined ? "var(--primary)" : subjectColorVar(subject.colorIndex);
  return { ...position, background: color };
}

/**
 * 플래너 타임테이블
 *
 * 5시에서 시작해 다음 날 4시에서 끝나는 24행, 한 행은 10분 칸 6개.
 * 칸 안은 실제 시작·종료 시각대로 나눠 칠한다(칸 단위로 반올림하지 않는다).
 * 과목을 고르고 공부한 순공은 과목 색, 과목 없이 공부한 순공은 기본 집중색, 순공이 아닌 시간은 휴식색이다.
 * 칸 144개를 버튼으로 만들지 않고 그리드 한 곳에서 눌린 칸을 찾는다.
 * 그래서 스크린 리더·키보드용으로 수동 기록 묶음마다 숨은 버튼을 그리드 뒤에 둔다.
 */
export function PlannerTimetable({
  day,
  onCellTap,
  onEditBundle,
}: {
  day: PlannerDay;
  /** 칸을 눌렀을 때 그 칸의 시작 시각. 없으면 칸이 반응하지 않는다. */
  onCellTap?: (cellStartMs: number) => void;
  /** 숨은 수정 버튼을 눌렀을 때. 없으면 버튼을 두지 않는다. */
  onEditBundle?: (bundle: StudySessionSummary[]) => void;
}) {
  const cells = plannerCellFills(day);
  const bundles =
    onEditBundle === undefined
      ? []
      : manualBundles(day.sessions).filter((bundle) => {
          const span = bundleSpan(bundle);
          return span.endMs > day.startMs && span.startMs < day.endMs;
        });

  return (
    <>
      <div
        role="img"
        aria-label={`이 날의 시간대별 공부 분포. 순공 ${formatDuration(day.focusSec)}`}
        className="flex w-46 shrink-0 flex-col gap-0.5 pt-0.5"
        onClick={
          onCellTap === undefined
            ? undefined
            : (event) => {
                const cell = (event.target as Element).closest<HTMLElement>("[data-cell]");
                if (cell !== null) {
                  onCellTap(day.startMs + Number(cell.dataset.cell) * CELL_MS);
                }
              }
        }
      >
        {HOURS.map((hour, row) => (
          <div key={hour} className="flex items-center gap-1">
            <span
              aria-hidden
              // 자정을 넘긴 0~4시는 다음 날이라 흐리게 적는다.
              className={cn(
                "w-4 shrink-0 text-right text-[10px] leading-3.25 tabular-nums",
                hour < 5 ? "text-text-tertiary" : "text-muted-foreground",
              )}
            >
              {hour}
            </span>
            <span className="flex min-w-0 flex-1 gap-px">
              {Array.from({ length: PLANNER_CELLS_PER_ROW }, (_, column) => {
                const index = row * PLANNER_CELLS_PER_ROW + column;
                const fills = cells[index] ?? [];
                return (
                  <span
                    key={column}
                    data-cell={index}
                    className="relative h-3.25 min-w-0 flex-1 overflow-hidden rounded-[2px] bg-chart-empty"
                  >
                    {fills.map((fill, fillIndex) => (
                      <span
                        key={fillIndex}
                        data-paint={fill.paint.kind}
                        data-manual={fill.manual || undefined}
                        className={cn(
                          "absolute inset-y-0",
                          fill.paint.kind === "rest" && "bg-chart-rest",
                          fill.paint.kind === "focus" && "bg-primary",
                        )}
                        style={fillStyle(fill, day.subjects)}
                      />
                    ))}
                  </span>
                );
              })}
            </span>
          </div>
        ))}
      </div>
      {/* 스크린리더용 목록이지만 키보드 포커스가 들어오면 보이게 해 초점이 사라지지 않게 한다. */}
      {bundles.length > 0 && (
        <ul className="sr-only focus-within:not-sr-only focus-within:mt-2 focus-within:flex focus-within:flex-col focus-within:gap-1">
          {bundles.map((bundle) => (
            <li key={bundle[0]!.id}>
              <button
                type="button"
                onClick={() => onEditBundle?.(bundle)}
                className="min-h-11 rounded-md px-2 text-left text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--state-focus)"
              >
                {readAloudLabel({
                  subjectName: subjectNameOf(subjectIdOf(bundle[0]), day.subjects),
                  span: bundleSpan(bundle),
                })}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
