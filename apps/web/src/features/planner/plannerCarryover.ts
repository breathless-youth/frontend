import type { PlannerCarryRequest, PlannerTask } from "@focusmakers/types";

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isTask(value: unknown): value is PlannerTask {
  if (typeof value !== "object" || value === null) return false;
  const task = value as Record<string, unknown>;
  return (
    typeof task.key === "string" &&
    task.key.length > 0 &&
    (task.taskId === null || (Number.isSafeInteger(task.taskId) && Number(task.taskId) > 0)) &&
    Number.isSafeInteger(task.subjectId) &&
    Number(task.subjectId) > 0 &&
    typeof task.name === "string" &&
    task.name.length > 0 &&
    validDate(task.date) &&
    typeof task.done === "boolean" &&
    typeof task.dismissed === "boolean" &&
    (task.doneAt === null || typeof task.doneAt === "string") &&
    (task.seriesId === null ||
      (Number.isSafeInteger(task.seriesId) && Number(task.seriesId) > 0)) &&
    (task.occurrenceDate === null || validDate(task.occurrenceDate))
  );
}

/** 반복 요일 판정은 반복 규칙을 보유한 서버가 맡는다. 응답이 모호하면 영구 무시 요청을 만들지 않는다. */
export function carryoverCandidates(raw: unknown, today: string): PlannerTask[] {
  if (
    !Array.isArray(raw) ||
    raw.length > 1000 ||
    !raw.every(isTask) ||
    new Set(raw.map((task) => task.key)).size !== raw.length
  ) {
    throw new Error("invalid planner carryover response");
  }
  const candidates = raw.filter((task) => task.date < today && !task.done && !task.dismissed);
  const latest = new Map<number, PlannerTask>();
  for (const task of candidates) {
    if (task.seriesId === null) continue;
    const previous = latest.get(task.seriesId);
    if (!previous || previous.date < task.date) latest.set(task.seriesId, task);
  }
  return candidates.filter((task) => task.seriesId === null || latest.get(task.seriesId) === task);
}

export function carryoverRequest(
  tasks: readonly PlannerTask[],
  selected: readonly string[],
): PlannerCarryRequest {
  const selection = new Set(selected);
  return {
    offeredKeys: tasks.map((task) => task.key),
    selectedKeys: tasks.filter((task) => selection.has(task.key)).map((task) => task.key),
  };
}

export function groupCarryoverTasks(
  tasks: readonly PlannerTask[],
): { date: string; tasks: PlannerTask[] }[] {
  const groups = new Map<string, PlannerTask[]>();
  for (const task of tasks) {
    const items = groups.get(task.date) ?? [];
    items.push(task);
    groups.set(task.date, items);
  }
  return [...groups]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, tasks]) => ({ date, tasks }));
}
