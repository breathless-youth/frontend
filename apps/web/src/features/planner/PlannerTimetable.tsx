import { useTranslation } from "react-i18next";

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
  PLANNER_CELLS_PER_ROW,
  plannerCellFills,
  plannerCellStartMs,
  plannerCurrentTime,
  plannerHours,
  type PlannerCellFill,
  type PlannerDay,
} from "./plannerDay";

const HOURS = plannerHours();

function fillStyle(fill: PlannerCellFill, subjects: ReadonlyMap<number, SubjectRef>) {
  const position = { left: `${String(fill.left * 100)}%`, width: `${String(fill.width * 100)}%` };
  const subject = fill.paint.kind === "subject" ? subjects.get(fill.paint.subjectId) : undefined;
  // 응답에 없는 과목 id는 엉뚱한 과목 색 대신 기본 집중색으로 둔다.
  const color = subject === undefined ? "var(--primary)" : subjectColorVar(subject.colorIndex);
  return {
    ...position,
    background: `color-mix(in srgb, ${color} 28%, transparent)`,
    borderLeft: fill.startsBlock ? `3px solid ${color}` : undefined,
  };
}

/**
 * 플래너 타임테이블
 *
 * 5시에서 시작해 다음 날 4시에서 끝나는 24행, 한 행은 10분 칸 6개.
 * 칸 안은 실제 시작·종료 시각대로 나눠 칠한다(칸 단위로 반올림하지 않는다).
 * 세션 전체를 과목색으로 칠하고 과목이 없으면 기본 집중색을 쓴다.
 * 칸 144개를 버튼으로 만들지 않고 그리드 한 곳에서 눌린 칸을 찾는다.
 * 그래서 스크린 리더·키보드용으로 수동 기록 묶음마다 숨은 버튼을 그리드 뒤에 둔다.
 */
export function PlannerTimetable({
  day,
  nowMs,
  onCellTap,
  onEditBundle,
  size = "legacy",
}: {
  day: PlannerDay;
  nowMs: number;
  /** 칸을 눌렀을 때 그 칸의 시작 시각. 없으면 칸이 반응하지 않는다. */
  onCellTap?: (cellStartMs: number) => void;
  /** 숨은 수정 버튼을 눌렀을 때. 없으면 버튼을 두지 않는다. */
  onEditBundle?: (bundle: StudySessionSummary[]) => void;
  /** 계획 화면은 승인 시안의 150×552 격자, 기존 기록 화면은 종전 크기를 쓴다. */
  size?: "legacy" | "plan";
}) {
  const { t } = useTranslation("planner");
  const cells = plannerCellFills(day);
  const currentTime = plannerCurrentTime(day.dateKey, nowMs, day.timeZone);
  const distribution = t("timetable.aria.distribution", {
    duration: formatDuration(day.focusSec),
  });
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
        aria-label={
          currentTime === null
            ? distribution
            : `${distribution}. ${t("timetable.aria.currentTime", { time: currentTime.label })}`
        }
        className={cn(
          "flex shrink-0 flex-col",
          size === "plan" ? "w-37.5 regular:w-full" : "w-46 pt-0.5",
        )}
        onClick={
          onCellTap === undefined
            ? undefined
            : (event) => {
                const cell = (event.target as Element).closest<HTMLElement>("[data-cell]");
                if (cell !== null) {
                  onCellTap(
                    plannerCellStartMs(day.dateKey, Number(cell.dataset.cell), day.timeZone),
                  );
                }
              }
        }
      >
        {HOURS.map((hour, row) => (
          <div key={hour} className={cn("flex items-center", size === "plan" ? "h-5.75" : "gap-1")}>
            <span
              aria-hidden
              // 자정을 넘긴 0~4시는 다음 날이라 흐리게 적는다.
              className={cn(
                "shrink-0 text-right text-[10px] leading-3.25 tabular-nums",
                size === "plan" ? "w-5.5 pr-1" : "w-4",
                currentTime?.hour === hour && "font-extrabold text-foreground",
                size !== "plan" && currentTime?.hour !== hour && hour < 5 && "text-text-tertiary",
                currentTime?.hour !== hour &&
                  (size === "plan" || hour >= 5) &&
                  "text-muted-foreground",
              )}
            >
              {size === "plan" ? String(hour).padStart(2, "0") : hour}
            </span>
            <span
              className={cn(
                "relative flex min-w-0 flex-1 border-l border-border",
                size === "plan" && "h-full",
                row === 0 && "border-t",
              )}
            >
              {Array.from({ length: PLANNER_CELLS_PER_ROW }, (_, column) => {
                const index = row * PLANNER_CELLS_PER_ROW + column;
                const fills = cells[index] ?? [];
                return (
                  <span
                    key={column}
                    data-cell={index}
                    className={cn(
                      "relative min-w-0 flex-1 overflow-hidden border-r border-b border-border bg-background",
                      size === "plan" ? "h-full" : "h-3.25",
                    )}
                  >
                    {fills.map((fill, fillIndex) => (
                      <span
                        key={fillIndex}
                        data-paint={fill.paint.kind}
                        data-manual={fill.manual || undefined}
                        className="absolute inset-y-0"
                        style={fillStyle(fill, day.subjects)}
                      />
                    ))}
                  </span>
                );
              })}
              {currentTime?.hour === hour && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -top-px z-10 h-0 w-0 -translate-x-1/2 border-x-4 border-t-6 border-x-transparent border-t-foreground"
                  style={{ left: `${String(currentTime.fraction * 100)}%` }}
                />
              )}
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
