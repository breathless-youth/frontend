import { BatteryFull, Check, ChevronLeft, Pencil, Plus, Signal, Wifi } from "lucide-react";
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import { PlannerTimetable } from "@/features/planner/PlannerTimetable";
import { plannerDayWindow, type PlannerDay } from "@/features/planner/plannerDay";
import { formatDuration } from "@/features/records/recordsFormat";
import { cn } from "@/lib/utils";

import "./PlannerScreen.css";

/** 폰 속 그림은 기기 테마와 관계없이 기존 라이트 목업 색을 유지한다. */
const LIGHT = {
  "--background": "#ffffff",
  "--foreground": "#1f2a3d",
  "--muted-foreground": "#556173",
  "--text-tertiary": "#b3bccb",
  "--primary": "#3671cf",
  "--border": "#e8eef8",
  "--subject-0": "#e5484d",
  "--subject-7": "#12a594",
  "--subject-2": "#f5a623",
  color: "#1f2a3d",
  background: "linear-gradient(180deg, #eef3fb 0%, #ffffff 38%)",
} as CSSProperties;

const SUBJECTS = [
  {
    id: 1,
    name: "math",
    colorIndex: 0,
    seconds: 9600,
    completedFirst: true,
    tasks: ["calculus", "pastExams"],
  },
  {
    id: 2,
    name: "english",
    colorIndex: 7,
    seconds: 7200,
    completedFirst: true,
    tasks: ["vocab", "listening"],
  },
  {
    id: 3,
    name: "korean",
    colorIndex: 2,
    seconds: 8040,
    completedFirst: false,
    tasks: ["reading"],
  },
] as const;

/** 실제 계정과 무관한 예시. 아침부터 19시까지 분산하고 14:44의 분 단위 끝도 그대로 칠한다. */
const RECORDS = [
  [1, "06:40", "07:40"],
  [2, "08:20", "09:00"],
  [3, "09:30", "10:10"],
  [1, "10:50", "11:40"],
  [2, "12:30", "13:10"],
  [3, "14:00", "14:44"],
  [1, "15:20", "16:10"],
  [2, "17:00", "17:40"],
  [3, "18:20", "19:10"],
] as const;
const DAY: Omit<PlannerDay, "subjects"> = {
  dateKey: "2026-11-07",
  timeZone: "Asia/Seoul",
  ...plannerDayWindow("2026-11-07", "Asia/Seoul"),
  focusSec: SUBJECTS.reduce((total, subject) => total + subject.seconds, 0),
  studySec: SUBJECTS.reduce((total, subject) => total + subject.seconds, 0),
  paints: RECORDS.map(([subjectId, start, end]) => ({
    kind: "subject",
    subjectId,
    startMs: Date.parse(`2026-11-07T${start}:00+09:00`),
    endMs: Date.parse(`2026-11-07T${end}:00+09:00`),
    manual: false,
  })),
  subjectRows: SUBJECTS.map((subject) => ({ subjectId: subject.id, focusSec: subject.seconds })),
  unassignedFocusSec: 0,
  completedTasks: [],
  sessions: [],
};
const NOW_MS = Date.parse("2026-11-07T19:41:00+09:00");

function TaskCheck({ done, enlarged = false }: { done: boolean; enlarged?: boolean }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border",
        enlarged ? "size-4" : "size-4.5",
      )}
      style={{
        color: done ? "white" : undefined,
        background: done ? "var(--subject-color)" : "white",
        borderColor: done
          ? "var(--subject-color)"
          : "color-mix(in srgb, var(--subject-color) 55%, white)",
      }}
    >
      {done && <Check size={enlarged ? 10 : 12} strokeWidth={2.5} />}
    </span>
  );
}

/** 현재 일간 플래너의 정적인 그림. 탭·할 일·기록은 실제 행동을 연결하지 않는다. */
export function PlannerScreen() {
  const { t } = useTranslation("onboarding");
  const timetableRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const paints = timetableRef.current?.querySelectorAll<HTMLElement>("[data-paint]") ?? [];
    paints.forEach((paint, index) => {
      paint.style.setProperty("--onboarding-paint-delay", `${0.18 + index * 0.04}s`);
    });
  }, []);
  const day: PlannerDay = {
    ...DAY,
    subjects: new Map(
      SUBJECTS.map((subject) => [
        subject.id,
        {
          id: subject.id,
          name: t(`planner.${subject.name}`),
          colorIndex: subject.colorIndex,
          deleted: false,
        },
      ]),
    ),
  };
  return (
    <div
      inert
      className="pointer-events-none absolute top-0 left-0 h-212.25 w-97.5 origin-top-left"
      style={{ ...LIGHT, transform: "scale(0.80103)" }}
    >
      <div className="flex h-12 items-center justify-between px-6.25 text-[13px] font-semibold">
        <span>19:41</span>
        <span className="flex items-center gap-1">
          <Signal size={15} />
          <Wifi size={15} />
          <BatteryFull size={20} />
        </span>
      </div>
      <div className="relative flex h-13 items-center justify-center px-5">
        <span className="absolute left-5 flex size-11 items-center justify-center rounded-full border border-[#d1d9e7] bg-white">
          <ChevronLeft size={22} />
        </span>
        <div className="flex gap-1 rounded-[13px] bg-[#eef1f6] p-1 text-sm font-semibold">
          <span className="flex h-9 w-18 items-center justify-center rounded-[10px] bg-white shadow-sm">
            {t("planner.daily")}
          </span>
          <span className="flex h-9 w-18 items-center justify-center text-muted-foreground">
            {t("planner.weekly")}
          </span>
        </div>
      </div>
      <div className="flex items-end justify-between px-5 pt-1.25 pb-4.5">
        <div className="flex items-baseline gap-1.75 text-[22px] leading-9 font-bold tracking-[-0.5px]">
          {t("planner.date")}
          <span className="font-semibold text-muted-foreground">{t("planner.dayName")}</span>
        </div>
        <div className="flex flex-col items-end gap-px">
          <span className="text-xs leading-4 text-muted-foreground">{t("planner.focusLabel")}</span>
          <span className="text-lg leading-5.5 font-extrabold">{formatDuration(day.focusSec)}</span>
        </div>
      </div>
      <div className="flex gap-3.5 px-5">
        <div className="min-w-0 flex-1 space-y-3">
          {SUBJECTS.map((subject) => (
            <div
              key={subject.id}
              style={{ "--subject-color": `var(--subject-${subject.colorIndex})` } as CSSProperties}
            >
              <div className="mb-1 flex items-center gap-1.5 pl-0.5">
                <span className="size-2 shrink-0 rounded-[2px] bg-(--subject-color)" />
                <span className="min-w-0 truncate text-[13px] leading-4.5 font-bold">
                  {t(`planner.${subject.name}`)}
                </span>
                {subject.seconds > 0 && (
                  <span className="ml-auto shrink-0 text-[11px] font-semibold text-muted-foreground">
                    {formatDuration(subject.seconds)}
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {subject.tasks.map((task, index) => {
                  const done = subject.completedFirst && index === 0;
                  return (
                    <div
                      key={task}
                      className="flex min-h-8.5 items-start gap-2 rounded-l-[3px] rounded-r-[10px] border-l-3 py-2 pr-2 pl-2.25"
                      style={{
                        borderColor: done ? "#d1d6db" : "var(--subject-color)",
                        background: done
                          ? "#f1f5fc"
                          : "color-mix(in srgb, var(--subject-color) 16%, white)",
                      }}
                    >
                      <span
                        className={cn(
                          "min-w-0 flex-1 text-[13px] leading-4.5 font-semibold",
                          done && "font-medium text-muted-foreground line-through",
                        )}
                      >
                        {t(`plannerTask.${task}`)}
                      </span>
                      <TaskCheck done={done} />
                    </div>
                  );
                })}
              </div>
              <div className="flex h-7 items-center gap-1.25 pl-3 text-xs font-semibold text-muted-foreground">
                <Plus size={12} />
                {t("planner.addTask")}
              </div>
            </div>
          ))}
          <div className="flex h-8.5 items-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-[#d1d6db] pl-3 text-[13px] font-semibold text-muted-foreground">
            <Plus size={13} />
            {t("planner.addSubject")}
          </div>
        </div>
        <div ref={timetableRef} className="onboarding-planner-timetable w-37.5 shrink-0">
          <PlannerTimetable day={day} nowMs={NOW_MS} size="plan" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
        <Pencil size={13} />
        {t("planner.editRecords")}
      </div>
    </div>
  );
}

/** OP2의 할 일 확대. 폰과 같은 합성 예시이며 별도 상호작용은 없다. */
export function PlannerTaskDetail() {
  const { t } = useTranslation("onboarding");
  return (
    <div
      className="rounded-lg border border-border px-3.75 py-3.5 shadow-[0_6px_22px_rgba(63,120,218,0.12)]"
      style={{ ...LIGHT, background: "#ffffff", "--subject-color": "#e5484d" } as CSSProperties}
    >
      <p className="mb-1.75 text-[11px] text-muted-foreground">{t("planner.todayTasks")}</p>
      <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold">
        <span className="size-2 rounded-[2px] bg-(--subject-color)" />
        {t("planner.math")}
      </div>
      {SUBJECTS[0].tasks.map((task, index) => (
        <div
          key={task}
          className="mt-0.75 flex items-center justify-between gap-2.5 text-[12px] leading-5"
        >
          <span>{t(`plannerTask.${task}`)}</span>
          <TaskCheck done={index === 0} enlarged />
        </div>
      ))}
    </div>
  );
}
