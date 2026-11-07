export type PlannerMode = "past" | "today" | "future";

export function plannerMode(dateKey: string, todayKey: string): PlannerMode {
  return dateKey === todayKey ? "today" : dateKey < todayKey ? "past" : "future";
}
