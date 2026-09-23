import { useRef } from "react";

import type { StudySessionSummary, SubjectRef } from "@focusmakers/types";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

import { formatDuration, formatFocusRate, formatSessionTimeRange } from "./recordsFormat";
import { Timetable } from "./Timetable";
import {
  completedTasksOf,
  sessionRestSec,
  sessionTimetable,
  subjectColorVar,
  subjectRefMap,
  subjectTotalsOf,
} from "./recordsTimetable";

/**
 * 세션 상세 바텀시트
 *
 * 세션 행을 누르면 그 세션의 시각 범위·순공·휴식·집중률, 과목별 시간, 완료한 할 일, 그 세션의 24시간 타임테이블을 하단 시트로 연다.
 *
 * 시트는 body로 포털되어 페이지의 .theme-soft-blue 스코프를 벗어나므로, 콘텐츠 루트에 그
 * 클래스를 다시 붙여 과목 색·소프트블루 토큰이 풀리지 않게 한다.
 *
 * 닫는 동안(session=null) 마지막 세션을 유지해 300ms 퇴장 애니메이션 중 빈 시트가 보이지 않게 한다.
 * 휴식은 총 공부에서 순공을 뺀 값이고(sessionRestSec), 지운 과목·할 일 이름도 그대로 둔다.
 */
export function SessionDetailSheet({
  session,
  subjects,
  dateKey,
  onClose,
}: {
  session: StudySessionSummary | null;
  subjects: readonly SubjectRef[] | undefined;
  dateKey: string;
  onClose: () => void;
}) {
  const lastSession = useRef<StudySessionSummary | null>(null);
  if (session) {
    lastSession.current = session;
  }
  const shown = session ?? lastSession.current;

  const subjectMap = subjectRefMap(subjects);
  const subjectRows = shown ? subjectTotalsOf([shown]) : [];
  const tasks = shown ? completedTasksOf([shown]) : [];
  const slots = shown ? sessionTimetable(shown, dateKey) : [];
  const subjectSummary = subjectRows
    .map(
      (row) =>
        `${subjectMap.get(row.subjectId)?.name ?? "이름 없음"} ${formatDuration(row.studySec)}`,
    )
    .join(", ");

  return (
    <Sheet open={session !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="theme-soft-blue max-h-[85dvh] gap-0 overflow-y-auto rounded-t-xl p-5 pb-[calc(env(safe-area-inset-bottom)+16px)]"
      >
        {shown !== null && (
          <>
            <span aria-hidden className="mx-auto mb-3 h-1 w-9 rounded-full bg-border" />
            <SheetTitle className="text-base font-extrabold tracking-[-0.32px] text-foreground tabular-nums">
              {formatSessionTimeRange(shown.startedAt, shown.endedAt)}
            </SheetTitle>
            <SheetDescription className="sr-only">
              선택한 세션의 순공·휴식·집중률과 과목별 시간, 완료한 할 일을 보여줍니다.
            </SheetDescription>

            <div className="flex gap-3.5 pt-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="text-[11px] leading-[13px] text-muted-foreground">순공 시간</p>
                <p className="pt-[3px] text-[22px] leading-[26px] font-extrabold tracking-[-0.44px] text-primary tabular-nums">
                  {formatDuration(shown.focusSec)}
                </p>

                <div className="flex gap-2 pt-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <p className="text-[11px] leading-[13px] text-muted-foreground">휴식</p>
                    <p className="text-base leading-[19px] font-extrabold tracking-[-0.32px] text-foreground tabular-nums">
                      {formatDuration(sessionRestSec(shown))}
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <p className="text-[11px] leading-[13px] text-muted-foreground">집중률</p>
                    <p className="text-base leading-[19px] font-extrabold tracking-[-0.32px] text-foreground tabular-nums">
                      {formatFocusRate(shown.focusRate)}
                    </p>
                  </div>
                </div>

                <ul className="flex flex-col gap-[9px] pt-4">
                  {subjectRows.map((row) => (
                    <li key={row.subjectId} className="flex items-center gap-[7px]">
                      <span
                        className="size-[9px] shrink-0 rounded-[2.5px]"
                        style={{
                          background: subjectColorVar(
                            subjectMap.get(row.subjectId)?.colorIndex ?? 0,
                          ),
                        }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-xs leading-[15px] text-muted-foreground">
                        {subjectMap.get(row.subjectId)?.name ?? "이름 없음"}
                      </span>
                      <span className="text-xs leading-[15px] font-bold text-foreground tabular-nums">
                        {formatDuration(row.studySec)}
                      </span>
                    </li>
                  ))}
                </ul>

                {tasks.length > 0 && (
                  <div className="pt-3">
                    <p className="text-[11px] leading-[13px] font-bold text-muted-foreground">
                      완료한 할 일
                    </p>
                    <ul className="flex flex-col gap-1 pt-1.5">
                      {tasks.map((task) => (
                        <li
                          key={task.id}
                          className="flex items-center gap-1.5 text-[12px] leading-[16px] text-foreground"
                        >
                          <span aria-hidden className="text-primary">
                            ✓
                          </span>
                          <span className="min-w-0 flex-1 truncate">{task.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <Timetable
                slots={slots}
                subjects={subjectMap}
                label={`이 세션의 24시간 공부 분포. 순공 ${formatDuration(shown.focusSec)}, 휴식 ${formatDuration(
                  sessionRestSec(shown),
                )}${subjectSummary ? `. 과목별 ${subjectSummary}` : ""}`}
              />
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-5 min-h-11 w-full rounded-lg bg-brand-subtle text-[15px] font-bold text-primary"
            >
              닫기
            </button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
