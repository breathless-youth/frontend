import type { PlannerDayResponse } from "@focusmakers/types";
import { addDaysToDateKey } from "@/features/records/recordsFormat";
import { mondayWeekDateKeys } from "@/features/records/recordsPeriod";
import { plannerPlanModel, type PlannerPlanModel } from "./plannerPlanModel";

export interface PlannerWeekDay extends PlannerPlanModel {
  taskCount: number;
  completedCount: number;
}

export function initialWeekExpanded(dateKey: string, todayKey: string): string[] {
  const dates = mondayWeekDateKeys(dateKey);
  return [todayKey, addDaysToDateKey(todayKey, 1)].filter((date) => dates.includes(date));
}

/** 주간도 개인 플래너의 일간 응답을 권위로 사용한다. 원본 통계나 과목 누적을 섞지 않는다. */
export function plannerWeek(
  dateKey: string,
  todayKey: string,
  responses: readonly PlannerDayResponse[],
) {
  const dates = mondayWeekDateKeys(dateKey);
  const byDate = new Map(responses.map((day) => [day.date, day]));
  const days: PlannerWeekDay[] = dates.flatMap((date) => {
    const response = byDate.get(date);
    if (!response) return [];
    const day = plannerPlanModel(response, todayKey);
    const tasks = day.subjects.flatMap((subject) => subject.tasks);
    return [
      { ...day, taskCount: tasks.length, completedCount: tasks.filter((task) => task.done).length },
    ];
  });
  return { dates, days, focusSec: days.reduce((sum, day) => sum + day.focusSec, 0) };
}

/** 응답을 건드리지 않는 이동 미리보기. 실패하면 이 사본만 버려 원래 날짜로 복구한다. */
export function previewWeekTaskMove(
  days: readonly PlannerDayResponse[],
  key: string,
  toDate: string,
): PlannerDayResponse[] {
  const source = days
    .flatMap((day) => day.subjects)
    .find((subject) => subject.tasks.some((task) => task.key === key));
  const task = source?.tasks.find((item) => item.key === key);
  if (!source || !task || task.date === toDate || !days.some((day) => day.date === toDate))
    return [...days];
  return days.map((day) => {
    const subjects = day.subjects.map((subject) => ({
      ...subject,
      tasks: subject.tasks.filter((item) => item.key !== key),
    }));
    if (day.date !== toDate) return { ...day, subjects };
    const target = subjects.find((subject) => subject.id === task.subjectId);
    if (target) target.tasks = [...target.tasks, { ...task, date: toDate }];
    else
      subjects.push({
        ...source,
        selected: false,
        studySec: 0,
        focusSec: 0,
        tasks: [{ ...task, date: toDate }],
      });
    return { ...day, subjects };
  });
}
