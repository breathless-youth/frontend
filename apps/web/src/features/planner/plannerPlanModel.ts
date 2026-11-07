import type { PlannerDayResponse, PlannerDaySubject } from "@focusmakers/types";

import { plannerMode, type PlannerMode } from "./plannerPermissions";

export interface PlannerPlanSubject extends PlannerDaySubject {
  hasRecord: boolean;
  canRemove: boolean;
  canAddTask: boolean;
}

export interface PlannerPlanModel extends PlannerDayResponse {
  mode: PlannerMode;
  subjects: PlannerPlanSubject[];
}

export function plannerPlanModel(day: PlannerDayResponse, todayKey: string): PlannerPlanModel {
  const mode = plannerMode(day.date, todayKey);
  const recorded = new Set(
    day.records.flatMap((record) => record.subjectSegments.map((segment) => segment.subjectId)),
  );
  return {
    ...day,
    mode,
    subjects: day.subjects.map((subject) => ({
      ...subject,
      hasRecord: recorded.has(subject.id),
      canRemove: mode !== "past" && !subject.deleted && !recorded.has(subject.id),
      canAddTask: mode !== "past" && !subject.deleted && subject.tasks.length < 30,
    })),
  };
}
