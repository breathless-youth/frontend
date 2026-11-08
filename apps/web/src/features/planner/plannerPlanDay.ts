import type { PlannerDayResponse, PlannerRecordView } from "@focusmakers/types";
import { plannerDayWindow, type PlannerDay, type PlannerPaint } from "./plannerDay";

export function plannerRecordPaints(
  record: PlannerRecordView,
  window: { startMs: number; endMs: number },
): PlannerPaint[] {
  const paints: PlannerPaint[] = [];
  const start = Math.max(window.startMs, Date.parse(record.startedAt));
  const end = Math.min(window.endMs, Date.parse(record.endedAt));
  const cuts = [
    ...new Set([
      start,
      end,
      ...record.subjectSegments.flatMap((segment) => [
        Math.max(start, Date.parse(segment.startedAt)),
        Math.min(end, Date.parse(segment.endedAt)),
      ]),
    ]),
  ]
    .filter((value) => value >= start && value <= end)
    .sort((a, b) => a - b);
  for (let index = 0; index < cuts.length - 1; index++) {
    const from = cuts[index]!,
      to = cuts[index + 1]!;
    const segment = record.subjectSegments.find(
      (item) => Date.parse(item.startedAt) <= from && Date.parse(item.endedAt) >= to,
    );
    let startMs = Math.max(window.startMs, Math.ceil(from / 60_000) * 60_000);
    const endMs = Math.min(window.endMs, Math.ceil(to / 60_000) * 60_000);
    // 원본의 양끝이 같은 분으로 올림되어도 실제 기록이 있던 1분 칸은 남긴다.
    // 표시 영역만 넓히며 원본 시각·기록 길이·집계 값은 바꾸지 않는다.
    if (to > from && startMs === endMs) startMs = Math.max(window.startMs, endMs - 60_000);
    if (endMs <= startMs) continue;
    paints.push({
      startMs,
      endMs,
      manual: record.source === "MANUAL",
      ...(record.edited ? { edited: true } : {}),
      ...(segment
        ? { kind: "subject" as const, subjectId: segment.subjectId }
        : { kind: "focus" as const }),
    });
  }
  return paints;
}

export function plannerPlanDay(plan: PlannerDayResponse): PlannerDay {
  const window = plannerDayWindow(plan.date, plan.timeZone);
  const paints = plan.records.flatMap((record) => plannerRecordPaints(record, window));
  return {
    dateKey: plan.date,
    timeZone: plan.timeZone,
    ...window,
    focusSec: plan.focusSec,
    studySec: plan.studySec,
    paints,
    subjectRows: plan.subjects.map((subject) => ({
      subjectId: subject.id,
      focusSec: subject.focusSec,
    })),
    unassignedFocusSec: Math.max(
      0,
      plan.focusSec - plan.subjects.reduce((sum, subject) => sum + subject.focusSec, 0),
    ),
    completedTasks: [],
    sessions: [],
    subjects: new Map(
      plan.subjects.map((subject) => [
        subject.id,
        {
          id: subject.id,
          name: subject.name,
          colorIndex: subject.colorIndex,
          deleted: subject.deleted,
        },
      ]),
    ),
  };
}
