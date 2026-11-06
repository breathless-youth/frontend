import { queryOptions } from "@tanstack/react-query";

import { getPlannerDay, getPlannerSummary } from "./plannerApi";
import type { DateRange } from "./statsApi";

export const plannerKeys = {
  all: ["planner"] as const,
  user: (userId: number) => ["planner", userId] as const,
  day: (userId: number, date: string, timeZone: string) =>
    ["planner", userId, "day", date, timeZone] as const,
  summary: (userId: number, range: DateRange, timeZone: string) =>
    ["planner", userId, "summary", range.from, range.to, timeZone] as const,
};

export function plannerDayQuery(userId: number, date: string, timeZone: string) {
  return queryOptions({
    queryKey: plannerKeys.day(userId, date, timeZone),
    queryFn: ({ signal }) => getPlannerDay(date, { timeZone, signal }),
  });
}

export function plannerSummaryQuery(userId: number, range: DateRange, timeZone: string) {
  return queryOptions({
    queryKey: plannerKeys.summary(userId, range, timeZone),
    queryFn: ({ signal }) => getPlannerSummary(range, { timeZone, signal }),
  });
}
