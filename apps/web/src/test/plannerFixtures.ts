import type {
  PlannerDayResponse,
  PlannerDaySubject,
  PlannerRecordView,
  PlannerTask,
} from "@focusmakers/types";

export function plannerTask(over: Partial<PlannerTask> = {}): PlannerTask {
  return {
    key: "t:12",
    taskId: 12,
    subjectId: 3,
    name: "수학 3단원",
    date: "2026-11-06",
    done: false,
    doneAt: null,
    seriesId: null,
    occurrenceDate: null,
    dismissed: false,
    ...over,
  };
}

export function plannerSubject(over: Partial<PlannerDaySubject> = {}): PlannerDaySubject {
  return {
    id: 3,
    name: "수학",
    colorIndex: 2,
    deleted: false,
    selected: true,
    studySec: 0,
    focusSec: 0,
    tasks: [],
    ...over,
  };
}

export function plannerRecord(over: Partial<PlannerRecordView> = {}): PlannerRecordView {
  return {
    key: "c:2026-11-06T00:00:00Z",
    source: "MEASURED",
    startedAt: "2026-11-06T00:00:00Z",
    endedAt: "2026-11-06T01:00:00Z",
    studySec: 3600,
    focusSec: 3000,
    subjectSegments: [
      {
        subjectId: 3,
        startedAt: "2026-11-06T00:00:00Z",
        endedAt: "2026-11-06T01:00:00Z",
        studySec: 3600,
        focusSec: 3000,
      },
    ],
    ...over,
  };
}

export function plannerDay(over: Partial<PlannerDayResponse> = {}): PlannerDayResponse {
  return {
    date: "2026-11-06",
    timeZone: "Asia/Seoul",
    studySec: 0,
    focusSec: 0,
    goal: { goalSec: null, individualGoalSec: null, defaultGoalSec: null },
    subjects: [],
    records: [],
    ...over,
  };
}
